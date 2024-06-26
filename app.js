const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { format } = require('date-fns');
require('dotenv').config();

const CLIENT_ID =process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN =process.env.REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({
  version: 'v3',
  auth: oauth2Client,
});

const app = express();
app.use(cors());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const currentDate = format(new Date(), 'yyyy-MM-dd_HH-mm-ss'); // Format current date and time
    const fileExtension = getFileExtension(file.originalname); // Extract sanitized file extension
    const filename = `${currentDate}.${fileExtension}`; // Combine date and extension
    cb(null, filename);
  }
});

function getFileExtension(filename) {
  const parts = filename.split('.');
  if (parts.length === 1) {
    return parts[0];
  }
  return parts.pop();
}

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF files are allowed.'));
    }
  },
  limits: {
    fileSize: 30 * 1024 * 1024 // 30MB limit
  }
}).single('file');

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

app.post('/upload', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File is too large. Maximum size allowed is 30MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const uploadDir = 'secure_uploads/';
    const securePath = path.join(uploadDir, req.file.filename);
    try {
      fs.mkdirSync(uploadDir, { recursive: true }); 
      fs.renameSync(req.file.path, securePath);

      // Upload file to Google Drive
      const response = await drive.files.create({
        requestBody: {
          name: req.file.originalname, // Use the original filename from the upload
          parents: ["1ADy6Zj3tNL6RVeljH_mSrSPk4iJp0wQI"],
          mimeType: 'application/pdf',
        },
        media: {
          mimeType: 'application/pdf',
          body: fs.createReadStream(securePath),
        },
      });

      const fileId = response.data.id;

      // Generate public URL
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      const result = await drive.files.get({
        fileId: fileId,
        fields: 'webViewLink, webContentLink',
      });

      console.log({
        fileId: fileId,
        webViewLink: result.data.webViewLink,
        webContentLink: result.data.webContentLink
      });

      // Unlink the file from secure_uploads
      fs.unlinkSync(securePath);

      return res.json({
        message: 'File uploaded successfully to Google Drive.',
        fileId: fileId,
        webViewLink: result.data.webViewLink,
        webContentLink: result.data.webContentLink,
      });

    } catch (error) {
      console.error('Error uploading to Google Drive:', error);
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Failed to upload the file to Google Drive.' });
    }
  });
});

async function uploadFile() {
  try {
    const filePath = path.join(__dirname, './animal.jpg');
    const response = await drive.files.create({
      requestBody: {
        name: 'animal.jpg', // This can be name of your choice
        parents: ["1ADy6Zj3tNL6RVeljH_mSrSPk4iJp0wQI"],
        mimeType: 'image/jpg',
      },
      media: {
        mimeType: 'image/jpg',
        body: fs.createReadStream(filePath),
      },
    });

    console.log(response.data);
  } catch (error) {
    console.log(error.message);
  }
}

async function deleteFile() {
  try {
    const response = await drive.files.delete({
      fileId: '1Kw_fNBcFvi8QDiFEG6PdNvtnhSInOf6H',
    });
    console.log(response.data, response.status);
  } catch (error) {
    console.log(error.message);
  }
}

async function generatePublicUrl() {
  try {
    const fileId = '1Kw_fNBcFvi8QDiFEG6PdNvtnhSInOf6H';
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const result = await drive.files.get({
      fileId: fileId,
      fields: 'webViewLink, webContentLink',
    });
    console.log(result.data);
  } catch (error) {
    console.log(error.message);
  }
}

app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
