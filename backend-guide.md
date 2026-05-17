# Backend Development Guide
## Secure Operational Signal Dissemination Platform
### Written for Beginners — Step by Step

---

## Where You Are Right Now

Before continuing, here is what you have already done:
- Installed PostgreSQL
- Installed Node.js
- Created your project folder at `C:/Users/arkod/Favorites/backend`
- Created the database called `signal_platform`
- Run the schema — all 9 tables are created

---

## PART 1 — Setting Up The Project

### Step 1 — Install project packages

Open the terminal in VS Code. Make sure you are inside your project folder by typing:

```bash
cd C:/Users/arkod/Favorites/backend
```

Then run:

```bash
npm init -y
```

This creates a file called `package.json` in your folder. Think of it as the ID card of your project.

Now install all the tools your backend needs:

```bash
npm install express pg dotenv bcryptjs jsonwebtoken uuid multer sharp qrcode
```

This will take a minute. Here is what each tool does:

| Package | What it does |
|---|---|
| express | Builds your API — the thing that receives and responds to requests |
| pg | Connects your Node.js code to PostgreSQL |
| dotenv | Lets you store sensitive info like passwords in a separate file |
| bcryptjs | Scrambles passwords before saving them so they cannot be read |
| jsonwebtoken | Creates login tokens so officers stay logged in |
| uuid | Generates unique IDs |
| multer | Handles file uploads (PDFs, images, audio) |
| sharp | Processes images — used for stamping QR codes on image signals |
| qrcode | Generates QR codes for watermarking |

Also install nodemon — this automatically restarts your server when you make changes:

```bash
npm install --save-dev nodemon
```

---

### Step 2 — Create your folder structure

Inside your `backend` folder, create the following folders and files exactly as shown.

You can create folders in VS Code by clicking the new folder icon in the file panel on the left.

```
backend/
├── controllers/
├── routes/
├── middleware/
├── services/
├── uploads/
├── app.js
├── server.js
└── .env
```

**What each folder is for:**

- `controllers/` — contains the logic for each feature (login, signals, etc.)
- `routes/` — defines the URL paths of your API
- `middleware/` — code that runs between every request (like checking if someone is logged in)
- `services/` — helper functions (like sending SMS or generating QR codes)
- `uploads/` — where uploaded files (PDFs, images) will be saved

---

### Step 3 — Create the .env file

The `.env` file stores sensitive information that should never be shared or pushed to GitHub. You already created this file — now open it and paste this inside:

```
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=signal_platform
DB_USER=postgres
DB_PASSWORD=your_postgresql_password_here
JWT_SECRET=choose_a_long_random_string_here
JWT_EXPIRES_IN=60m
```

Replace `your_postgresql_password_here` with the password you set when you installed PostgreSQL.

For `JWT_SECRET`, just type any long random string. Example: `x7k2mQ9pLz3nRv8wYj5cBq1dFt6uEs4`

> **Important:** Never share this file with anyone. Never upload it to GitHub.

---

### Step 4 — Create the database connection file

Create a new folder inside your project called `config`. Inside that folder, create a file called `db.js`.

**File: `config/db.js`**

```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test the connection when server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

module.exports = pool;
```

This file connects your Node.js code to PostgreSQL. Every time you need to talk to the database, you will import this file.

---

### Step 5 — Create app.js

**File: `app.js`**

```javascript
const express = require('express');
const app = express();
require('dotenv').config();

// This allows your server to understand JSON data sent to it
app.use(express.json());

// Import all your routes (we will create these later)
const authRoutes = require('./routes/authRoutes');
const signalRoutes = require('./routes/signalRoutes');
const adminRoutes = require('./routes/adminRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');

// Tell the app which URL prefix to use for each route
app.use('/api/auth', authRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/emergency', emergencyRoutes);

// A simple test route to confirm server is running
app.get('/', (req, res) => {
  res.json({ message: 'Signal Platform Backend is running' });
});

module.exports = app;
```

---

### Step 6 — Create server.js

**File: `server.js`**

```javascript
const app = require('./app');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
```

---

### Step 7 — Update package.json to add start scripts

Open `package.json` and find the `"scripts"` section. Replace it with this:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js"
}
```

Now to start your server you just type:

```bash
npm run dev
```

You should see:
```
Server is running on port 5000
Database connected successfully
```

If you see that, everything is working. 

---

## PART 2 — Authentication System

This handles login, logout, and making sure only registered officers can use the app.

### Step 8 — Create the Auth Middleware

Middleware is code that runs before your main logic. This one checks if the officer has a valid login token.

Create a file: `middleware/authMiddleware.js`

```javascript
const jwt = require('jsonwebtoken');
require('dotenv').config();

const protect = (req, res, next) => {
  // Get the token from the request header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the token is valid and not expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to the request
    next(); // Move on to the next function
  } catch (error) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
};

// Middleware to allow only certain roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to do this.' });
    }
    next();
  };
};

module.exports = { protect, authorize };
```

---

### Step 9 — Create the Audit Log Service

Every sensitive action in the system must be recorded. Instead of writing the same logging code everywhere, we create one helper function.

Create a file: `services/auditService.js`

```javascript
const pool = require('../config/db');

const logAction = async ({ userId, action, entityType, entityId, ipAddress, metadata }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, ipAddress, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { logAction };
```

---

### Step 10 — Create the Auth Controller

Create a file: `controllers/authController.js`

```javascript
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logAction } = require('../services/auditService');
require('dotenv').config();

// ----------------------------
// LOGIN
// ----------------------------
const login = async (req, res) => {
  const { username, password, deviceId, deviceModel, osVersion } = req.body;
  const ipAddress = req.ip;

  try {
    // 1. Find the user by username
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = userResult.rows[0];

    // 2. Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Your account has been suspended. Contact your admin.' });
    }

    // 3. Check the password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await logAction({ userId: user.id, action: 'FAILED_LOGIN', ipAddress });
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // 4. Check device binding
    const deviceResult = await pool.query(
      'SELECT * FROM devices WHERE user_id = $1 AND device_id = $2',
      [user.id, deviceId]
    );

    if (deviceResult.rows.length === 0) {
      // This is a new device — register it as pending
      await pool.query(
        `INSERT INTO devices (user_id, device_id, device_model, os_version, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (device_id) DO NOTHING`,
        [user.id, deviceId, deviceModel, osVersion]
      );
      return res.status(403).json({
        message: 'This device is not approved. Please wait for admin approval.'
      });
    }

    const device = deviceResult.rows[0];

    if (device.status === 'pending') {
      return res.status(403).json({ message: 'Your device is pending approval.' });
    }

    if (device.status === 'revoked') {
      return res.status(403).json({ message: 'This device has been revoked. Contact your admin.' });
    }

    // 5. Update device last login
    await pool.query(
      'UPDATE devices SET last_login = NOW(), last_ip = $1 WHERE id = $2',
      [ipAddress, device.id]
    );

    // 6. Create a login token
    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username, deviceId: device.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 7. Log the successful login
    await logAction({ userId: user.id, action: 'LOGIN', entityType: 'device', entityId: device.id, ipAddress });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        rank: user.rank,
        unit: user.unit,
        role: user.role,
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// ----------------------------
// REGISTER (Admin creates accounts, not self-registration)
// ----------------------------
const registerOfficer = async (req, res) => {
  const { fullName, rank, unit, phone, username, password, role } = req.body;

  try {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, rank, unit, phone, username, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, full_name, username, role`,
      [fullName, rank, unit, phone, username, hashedPassword, role]
    );

    await logAction({
      userId: req.user.id,
      action: 'OFFICER_CREATED',
      entityType: 'user',
      entityId: result.rows[0].id,
      ipAddress: req.ip
    });

    res.status(201).json({
      message: 'Officer registered successfully.',
      officer: result.rows[0]
    });

  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Username or phone number already exists.' });
    }
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// ----------------------------
// LOGOUT
// ----------------------------
const logout = async (req, res) => {
  await logAction({ userId: req.user.id, action: 'LOGOUT', ipAddress: req.ip });
  res.json({ message: 'Logged out successfully.' });
};

module.exports = { login, registerOfficer, logout };
```

---

### Step 11 — Create the Auth Routes

Create a file: `routes/authRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const { login, registerOfficer, logout } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public route — anyone can try to login
router.post('/login', login);

// Protected routes — must be logged in AND must be an admin
router.post(
  '/register',
  protect,
  authorize('super_admin', 'state_command_admin', 'area_command_admin'),
  registerOfficer
);

router.post('/logout', protect, logout);

module.exports = router;
```

---

## PART 3 — Signal System

This handles creating, sending, and viewing signals.

### Step 12 — Create the Watermark Service

Every signal must carry a unique QR code for each officer who views it. This is how you trace leaks.

Create a file: `services/watermarkService.js`

```javascript
const QRCode = require('qrcode');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

// Generate a unique watermark code for this officer + signal combination
const generateWatermarkCode = (signalId, userId) => {
  return `SIG:${signalId}:USR:${userId}:${uuidv4()}`;
};

// Save the watermark record to the database for tracing
const saveWatermarkLog = async (signalId, userId, watermarkCode) => {
  await pool.query(
    `INSERT INTO watermark_logs (signal_id, user_id, watermark_code)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [signalId, userId, watermarkCode]
  );
};

// Stamp a QR code onto an image signal
const stampQROnImage = async (imagePath, watermarkCode) => {
  // Generate the QR code as a PNG buffer
  const qrBuffer = await QRCode.toBuffer(watermarkCode, {
    width: 100,
    margin: 1,
  });

  // Get image dimensions
  const imageInfo = await sharp(imagePath).metadata();

  // Stamp QR code at bottom-right corner of the image
  const outputBuffer = await sharp(imagePath)
    .composite([
      {
        input: qrBuffer,
        gravity: 'southeast', // bottom-right corner
      }
    ])
    .toBuffer();

  return outputBuffer;
};

module.exports = { generateWatermarkCode, saveWatermarkLog, stampQROnImage };
```

---

### Step 13 — Create the Encryption Service

Signal text content must be encrypted before being saved to the database.

Create a file: `services/encryptionService.js`

```javascript
const crypto = require('crypto');

// Use the JWT_SECRET as the base for our encryption key
const ENCRYPTION_KEY = crypto.scryptSync(process.env.JWT_SECRET || 'fallback', 'salt', 32);
const IV_LENGTH = 16; // AES requires a 16-byte IV

// Encrypt text before saving to database
const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Save IV + encrypted content together
  return iv.toString('hex') + ':' + encrypted;
};

// Decrypt text when retrieving from database
const decrypt = (encryptedText) => {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encrypt, decrypt };
```

---

### Step 14 — Create the Signal Controller

Create a file: `controllers/signalController.js`

```javascript
const pool = require('../config/db');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { encrypt, decrypt } = require('../services/encryptionService');
const { generateWatermarkCode, saveWatermarkLog, stampQROnImage } = require('../services/watermarkService');
const { logAction } = require('../services/auditService');

// ----------------------------
// CREATE A SIGNAL
// ----------------------------
const createSignal = async (req, res) => {
  const { title, contentType, content, classification, expiryTime, recipientIds } = req.body;
  const senderId = req.user.id;

  try {
    // Generate a human-readable signal number e.g. SIG-2024-001
    const countResult = await pool.query('SELECT COUNT(*) FROM signals');
    const signalNumber = `SIG-${new Date().getFullYear()}-${String(Number(countResult.rows[0].count) + 1).padStart(4, '0')}`;

    let encryptedContent = null;
    let filePath = null;

    // If it is a text signal, encrypt the content
    if (contentType === 'text' && content) {
      encryptedContent = Buffer.from(encrypt(content));
    }

    // If it is a file (PDF, image, audio), the path comes from the file upload middleware
    if (req.file) {
      filePath = req.file.path;
    }

    // Save the signal to the database
    const signalResult = await pool.query(
      `INSERT INTO signals (signal_number, title, content_type, content_encrypted, file_path, classification, sender_id, expiry_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [signalNumber, title, contentType, encryptedContent, filePath, classification, senderId, expiryTime || null]
    );

    const signal = signalResult.rows[0];

    // Add recipients to the signal_recipients table
    if (recipientIds && recipientIds.length > 0) {
      for (const recipientId of recipientIds) {
        await pool.query(
          'INSERT INTO signal_recipients (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [signal.id, recipientId]
        );
        // Create a receipt record for tracking
        await pool.query(
          'INSERT INTO signal_receipts (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [signal.id, recipientId]
        );
      }
    }

    await logAction({
      userId: senderId,
      action: 'SIGNAL_CREATED',
      entityType: 'signal',
      entityId: signal.id,
      ipAddress: req.ip,
      metadata: { classification, signalNumber }
    });

    res.status(201).json({ message: 'Signal created successfully.', signal: { id: signal.id, signalNumber } });

  } catch (error) {
    console.error('Create signal error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ----------------------------
// GET INBOX (signals for the logged-in officer)
// ----------------------------
const getInbox = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT 
         s.id, s.signal_number, s.title, s.classification, s.content_type,
         s.created_at, s.expiry_time, s.is_expired,
         sr.viewed_at, sr.acknowledged_at, sr.delivered_at
       FROM signals s
       JOIN signal_recipients srec ON srec.signal_id = s.id
       LEFT JOIN signal_receipts sr ON sr.signal_id = s.id AND sr.user_id = $1
       WHERE srec.user_id = $1
         AND (s.expiry_time IS NULL OR s.expiry_time > NOW())
         AND s.is_expired = FALSE
       ORDER BY s.created_at DESC`,
      [userId]
    );

    res.json({ signals: result.rows });

  } catch (error) {
    console.error('Get inbox error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ----------------------------
// VIEW A SINGLE SIGNAL
// ----------------------------
const viewSignal = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Check that this officer is a recipient of this signal
    const recipientCheck = await pool.query(
      'SELECT 1 FROM signal_recipients WHERE signal_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (recipientCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have access to this signal.' });
    }

    // Get the signal
    const signalResult = await pool.query('SELECT * FROM signals WHERE id = $1', [id]);
    const signal = signalResult.rows[0];

    if (!signal) return res.status(404).json({ message: 'Signal not found.' });

    // Check if signal has expired
    if (signal.is_expired || (signal.expiry_time && new Date(signal.expiry_time) < new Date())) {
      return res.status(410).json({ message: 'This signal has expired and can no longer be viewed.' });
    }

    // Generate a unique watermark for this officer
    const watermarkCode = generateWatermarkCode(id, userId);
    await saveWatermarkLog(id, userId, watermarkCode);

    // Mark signal as viewed
    await pool.query(
      `UPDATE signal_receipts SET viewed_at = NOW(), delivery_method = 'push'
       WHERE signal_id = $1 AND user_id = $2 AND viewed_at IS NULL`,
      [id, userId]
    );

    // Log the view
    await logAction({
      userId,
      action: 'SIGNAL_VIEWED',
      entityType: 'signal',
      entityId: id,
      ipAddress: req.ip
    });

    // Prepare the response
    let responseData = {
      id: signal.id,
      signalNumber: signal.signal_number,
      title: signal.title,
      classification: signal.classification,
      contentType: signal.content_type,
      createdAt: signal.created_at,
      expiryTime: signal.expiry_time,
      watermarkCode, // The mobile app uses this to display the watermark
    };

    // Decrypt text content
    if (signal.content_type === 'text' && signal.content_encrypted) {
      responseData.content = decrypt(signal.content_encrypted.toString());
    }

    // For image signals, stamp the QR watermark onto the image
    if (signal.content_type === 'image' && signal.file_path) {
      const watermarkedImageBuffer = await stampQROnImage(signal.file_path, watermarkCode);
      // Convert to base64 so it can be sent in JSON
      responseData.imageData = watermarkedImageBuffer.toString('base64');
    }

    // For PDF and audio, provide the file path (serve via separate endpoint)
    if (signal.content_type === 'pdf' || signal.content_type === 'audio') {
      responseData.fileUrl = `/api/signals/${id}/file?token=${req.headers.authorization?.split(' ')[1]}`;
    }

    res.json(responseData);

  } catch (error) {
    console.error('View signal error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ----------------------------
// ACKNOWLEDGE A SIGNAL
// ----------------------------
const acknowledgeSignal = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    await pool.query(
      `UPDATE signal_receipts SET acknowledged_at = NOW()
       WHERE signal_id = $1 AND user_id = $2 AND acknowledged_at IS NULL`,
      [id, userId]
    );

    await logAction({ userId, action: 'SIGNAL_ACKNOWLEDGED', entityType: 'signal', entityId: id, ipAddress: req.ip });

    res.json({ message: 'Signal acknowledged.' });

  } catch (error) {
    console.error('Acknowledge error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ----------------------------
// LOG A SCREENSHOT ATTEMPT
// ----------------------------
const logScreenshot = async (req, res) => {
  const { signalId } = req.body;
  const userId = req.user.id;

  try {
    await pool.query(
      `INSERT INTO screenshot_logs (user_id, signal_id, ip_address)
       VALUES ($1, $2, $3)`,
      [userId, signalId || null, req.ip]
    );

    await logAction({
      userId,
      action: 'SCREENSHOT_DETECTED',
      entityType: 'signal',
      entityId: signalId,
      ipAddress: req.ip
    });

    res.json({ message: 'Logged.' });

  } catch (error) {
    console.error('Screenshot log error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { createSignal, getInbox, viewSignal, acknowledgeSignal, logScreenshot };
```

---

### Step 15 — Create the File Upload Middleware

Create a file: `middleware/uploadMiddleware.js`

```javascript
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

module.exports = upload;
```

---

### Step 16 — Create Signal Routes

Create a file: `routes/signalRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const { createSignal, getInbox, viewSignal, acknowledgeSignal, logScreenshot } = require('../controllers/signalController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// All signal routes require login
router.use(protect);

// Get inbox
router.get('/inbox', getInbox);

// View a specific signal
router.get('/:id', viewSignal);

// Acknowledge a signal
router.post('/:id/acknowledge', acknowledgeSignal);

// Log a screenshot attempt (called by the mobile app when it detects a screenshot)
router.post('/screenshot', logScreenshot);

// Create a signal (only admins can send)
router.post(
  '/create',
  authorize('super_admin', 'state_command_admin', 'area_command_admin'),
  upload.single('file'),
  createSignal
);

module.exports = router;
```

---

## PART 4 — Emergency Broadcasts

### Step 17 — Create the Notification Service

This service handles sending push notifications. For SMS, you will need to sign up for a service like Termii (popular in Nigeria) or Twilio.

Create a file: `services/notificationService.js`

```javascript
// For SMS in Nigeria, Termii is recommended: https://termii.com
// Sign up, get your API key, and add it to your .env file as TERMII_API_KEY and TERMII_SENDER_ID

const sendSMS = async (phoneNumber, message) => {
  try {
    const response = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phoneNumber,
        from: process.env.TERMII_SENDER_ID,
        sms: message,
        type: 'plain',
        api_key: process.env.TERMII_API_KEY,
        channel: 'generic'
      })
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('SMS send error:', error.message);
    return null;
  }
};

// For push notifications, you will integrate Firebase Cloud Messaging (FCM)
// For now this is a placeholder — FCM setup comes after basic testing
const sendPushNotification = async (deviceToken, title, body, data = {}) => {
  console.log(`Push notification: To=${deviceToken} Title=${title}`);
  // FCM implementation goes here after you set up Firebase
};

module.exports = { sendSMS, sendPushNotification };
```

---

### Step 18 — Create the Emergency Controller

Create a file: `controllers/emergencyController.js`

```javascript
const pool = require('../config/db');
const { sendSMS, sendPushNotification } = require('../services/notificationService');
const { logAction } = require('../services/auditService');

// ----------------------------
// SEND EMERGENCY BROADCAST
// ----------------------------
const sendEmergencyBroadcast = async (req, res) => {
  const { title, content, recipientIds } = req.body;
  const senderId = req.user.id;

  try {
    // Check the SMS fallback setting from the settings table
    const settingResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'sms_fallback_mode'"
    );
    const smsFallbackMode = settingResult.rows[0]?.value || 'manual';

    // Create the emergency signal
    const countResult = await pool.query('SELECT COUNT(*) FROM signals');
    const signalNumber = `EMG-${new Date().getFullYear()}-${String(Number(countResult.rows[0].count) + 1).padStart(4, '0')}`;

    const encryptedContent = Buffer.from(require('../services/encryptionService').encrypt(content));

    const signalResult = await pool.query(
      `INSERT INTO signals (signal_number, title, content_type, content_encrypted, classification, sender_id)
       VALUES ($1, $2, 'text', $3, 'emergency', $4) RETURNING *`,
      [signalNumber, title, encryptedContent, senderId]
    );

    const signal = signalResult.rows[0];

    // Get recipients
    let recipients = [];
    if (recipientIds && recipientIds.length > 0) {
      const result = await pool.query(
        'SELECT id, phone FROM users WHERE id = ANY($1) AND status = $2',
        [recipientIds, 'active']
      );
      recipients = result.rows;
    } else {
      // If no specific recipients, broadcast to ALL active officers
      const result = await pool.query("SELECT id, phone FROM users WHERE status = 'active'");
      recipients = result.rows;
    }

    // Send to each recipient
    for (const recipient of recipients) {
      // Add to signal recipients
      await pool.query(
        'INSERT INTO signal_recipients (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [signal.id, recipient.id]
      );

      // Create receipt record
      await pool.query(
        'INSERT INTO signal_receipts (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [signal.id, recipient.id]
      );

      // Send push notification
      await sendPushNotification(
        recipient.id, // In real implementation, this will be the FCM device token
        `EMERGENCY: ${title}`,
        content,
        { signalId: signal.id, type: 'emergency' }
      );

      // If SMS fallback is auto, also send SMS immediately
      if (smsFallbackMode === 'auto') {
        await sendSMS(
          recipient.phone,
          `EMERGENCY SIGNAL [${signalNumber}]: ${title}. Open the Signal Platform app immediately.`
        );
        await pool.query(
          `UPDATE signal_receipts SET delivery_method = 'sms' WHERE signal_id = $1 AND user_id = $2`,
          [signal.id, recipient.id]
        );
      }
    }

    await logAction({
      userId: senderId,
      action: 'EMERGENCY_BROADCAST',
      entityType: 'signal',
      entityId: signal.id,
      ipAddress: req.ip,
      metadata: { recipientCount: recipients.length, smsFallbackMode }
    });

    res.status(201).json({
      message: 'Emergency broadcast sent.',
      signalNumber,
      recipientCount: recipients.length
    });

  } catch (error) {
    console.error('Emergency broadcast error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ----------------------------
// MANUALLY TRIGGER SMS FALLBACK (for manual mode)
// ----------------------------
const triggerSmsFallback = async (req, res) => {
  const { signalId } = req.params;

  try {
    // Get the signal
    const signalResult = await pool.query('SELECT * FROM signals WHERE id = $1', [signalId]);
    const signal = signalResult.rows[0];
    if (!signal) return res.status(404).json({ message: 'Signal not found.' });

    // Get recipients who have not acknowledged yet
    const pendingResult = await pool.query(
      `SELECT u.phone, sr.user_id FROM signal_receipts sr
       JOIN users u ON u.id = sr.user_id
       WHERE sr.signal_id = $1 AND sr.acknowledged_at IS NULL`,
      [signalId]
    );

    for (const recipient of pendingResult.rows) {
      await sendSMS(
        recipient.phone,
        `EMERGENCY SIGNAL [${signal.signal_number}]: ${signal.title}. Open the Signal Platform app immediately.`
      );
      await pool.query(
        `UPDATE signal_receipts SET delivery_method = 'sms' WHERE signal_id = $1 AND user_id = $2`,
        [signalId, recipient.user_id]
      );
    }

    res.json({ message: `SMS sent to ${pendingResult.rows.length} pending recipients.` });

  } catch (error) {
    console.error('SMS fallback error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ----------------------------
// GET EMERGENCY STATUS (who has acknowledged)
// ----------------------------
const getEmergencyStatus = async (req, res) => {
  const { signalId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
         u.full_name, u.rank, u.unit,
         sr.delivered_at, sr.viewed_at, sr.acknowledged_at, sr.delivery_method
       FROM signal_receipts sr
       JOIN users u ON u.id = sr.user_id
       WHERE sr.signal_id = $1
       ORDER BY sr.acknowledged_at ASC NULLS LAST`,
      [signalId]
    );

    res.json({ recipients: result.rows });

  } catch (error) {
    console.error('Emergency status error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { sendEmergencyBroadcast, triggerSmsFallback, getEmergencyStatus };
```

---

### Step 19 — Create Emergency Routes

Create a file: `routes/emergencyRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const { sendEmergencyBroadcast, triggerSmsFallback, getEmergencyStatus } = require('../controllers/emergencyController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

// Send emergency broadcast
router.post(
  '/broadcast',
  authorize('super_admin', 'state_command_admin', 'area_command_admin'),
  sendEmergencyBroadcast
);

// Manually trigger SMS fallback
router.post(
  '/:signalId/sms-fallback',
  authorize('super_admin', 'state_command_admin'),
  triggerSmsFallback
);

// View acknowledgment status
router.get(
  '/:signalId/status',
  authorize('super_admin', 'state_command_admin', 'area_command_admin'),
  getEmergencyStatus
);

module.exports = router;
```

---

## PART 5 — Admin Functions

### Step 20 — Create the Admin Controller

Create a file: `controllers/adminController.js`

```javascript
const pool = require('../config/db');
const { logAction } = require('../services/auditService');

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, rank, unit, phone, username, role, status, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Get all pending devices
const getPendingDevices = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.full_name, u.rank, u.unit 
       FROM devices d JOIN users u ON u.id = d.user_id
       WHERE d.status = 'pending'
       ORDER BY d.registered_at DESC`
    );
    res.json({ devices: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Approve a device
const approveDevice = async (req, res) => {
  const { deviceId } = req.params;

  try {
    // First revoke any other approved device for this user
    const deviceResult = await pool.query('SELECT user_id FROM devices WHERE id = $1', [deviceId]);
    const userId = deviceResult.rows[0]?.user_id;

    await pool.query(
      "UPDATE devices SET status = 'revoked' WHERE user_id = $1 AND status = 'approved'",
      [userId]
    );

    // Approve this device
    await pool.query("UPDATE devices SET status = 'approved' WHERE id = $1", [deviceId]);

    await logAction({
      userId: req.user.id,
      action: 'DEVICE_APPROVED',
      entityType: 'device',
      entityId: deviceId,
      ipAddress: req.ip
    });

    res.json({ message: 'Device approved.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Revoke a device
const revokeDevice = async (req, res) => {
  const { deviceId } = req.params;
  try {
    await pool.query("UPDATE devices SET status = 'revoked' WHERE id = $1", [deviceId]);
    await logAction({ userId: req.user.id, action: 'DEVICE_REVOKED', entityType: 'device', entityId: deviceId, ipAddress: req.ip });
    res.json({ message: 'Device revoked.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Suspend or reactivate a user
const updateUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body; // 'active', 'suspended', 'deactivated'

  try {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
    await logAction({ userId: req.user.id, action: `USER_STATUS_${status.toUpperCase()}`, entityType: 'user', entityId: userId, ipAddress: req.ip });
    res.json({ message: `User status updated to ${status}.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Get audit logs
const getAuditLogs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.full_name, u.rank FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT 500`
    );
    res.json({ logs: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Get screenshot logs (for leak investigation)
const getScreenshotLogs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sl.*, u.full_name, u.rank, u.unit, s.signal_number
       FROM screenshot_logs sl
       LEFT JOIN users u ON u.id = sl.user_id
       LEFT JOIN signals s ON s.id = sl.signal_id
       ORDER BY sl.detected_at DESC`
    );
    res.json({ logs: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Update system settings (e.g. change SMS fallback mode)
const updateSetting = async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  try {
    await pool.query(
      `UPDATE settings SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3`,
      [value, req.user.id, key]
    );
    await logAction({ userId: req.user.id, action: 'SETTING_UPDATED', entityType: 'setting', ipAddress: req.ip, metadata: { key, value } });
    res.json({ message: 'Setting updated.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Trace a watermark (scan QR code from leaked photo)
const traceWatermark = async (req, res) => {
  const { watermarkCode } = req.body;

  try {
    const result = await pool.query(
      `SELECT wl.*, u.full_name, u.rank, u.unit, u.phone, s.signal_number, s.title
       FROM watermark_logs wl
       JOIN users u ON u.id = wl.user_id
       JOIN signals s ON s.id = wl.signal_id
       WHERE wl.watermark_code = $1`,
      [watermarkCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Watermark not found in system.' });
    }

    const trace = result.rows[0];
    res.json({
      message: 'Watermark traced successfully.',
      leakSource: {
        officerName: trace.full_name,
        rank: trace.rank,
        unit: trace.unit,
        phone: trace.phone,
        signalNumber: trace.signal_number,
        signalTitle: trace.title,
        viewedAt: trace.generated_at
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getAllUsers,
  getPendingDevices,
  approveDevice,
  revokeDevice,
  updateUserStatus,
  getAuditLogs,
  getScreenshotLogs,
  updateSetting,
  traceWatermark
};
```

---

### Step 21 — Create Admin Routes

Create a file: `routes/adminRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const {
  getAllUsers, getPendingDevices, approveDevice, revokeDevice,
  updateUserStatus, getAuditLogs, getScreenshotLogs, updateSetting, traceWatermark
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All admin routes require login and admin role
router.use(protect);
router.use(authorize('super_admin', 'state_command_admin', 'area_command_admin'));

router.get('/users', getAllUsers);
router.patch('/users/:userId/status', updateUserStatus);
router.get('/devices/pending', getPendingDevices);
router.patch('/devices/:deviceId/approve', approveDevice);
router.patch('/devices/:deviceId/revoke', revokeDevice);
router.get('/audit-logs', getAuditLogs);
router.get('/screenshot-logs', getScreenshotLogs);
router.patch('/settings/:key', updateSetting);
router.post('/trace-watermark', traceWatermark);

module.exports = router;
```

---

## PART 6 — Signal Expiry Background Job

Signals need to auto-expire even when no one is making a request to the server. For this you need a background job.

### Step 22 — Install node-cron

```bash
npm install node-cron
```

### Step 23 — Create the expiry job

Create a file: `services/expiryService.js`

```javascript
const cron = require('node-cron');
const pool = require('../config/db');

const startExpiryJob = () => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await pool.query(
        `UPDATE signals SET is_expired = TRUE
         WHERE expiry_time < NOW() AND is_expired = FALSE
         RETURNING signal_number`
      );
      if (result.rows.length > 0) {
        console.log(`Expired ${result.rows.length} signal(s).`);
      }
    } catch (error) {
      console.error('Expiry job error:', error.message);
    }
  });

  console.log('Signal expiry job started — runs every 5 minutes.');
};

module.exports = { startExpiryJob };
```

### Step 24 — Start the job when the server starts

Open `server.js` and update it:

```javascript
const app = require('./app');
const { startExpiryJob } = require('./services/expiryService');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startExpiryJob(); // Start the background expiry checker
});
```

---

## PART 7 — Testing Your API

Once your server is running (`npm run dev`), you need a way to test your API endpoints without a mobile app yet. Use a tool called **Postman**.

### Download Postman
👉 https://www.postman.com/downloads/

### How to test Login

1. Open Postman
2. Set method to **POST**
3. URL: `http://localhost:5000/api/auth/login`
4. Click **Body → raw → JSON**
5. Paste:

```json
{
  "username": "admin",
  "password": "yourpassword",
  "deviceId": "TEST-DEVICE-001",
  "deviceModel": "Test PC",
  "osVersion": "Windows 11"
}
```

6. Click Send

---

## Final Folder Structure

When everything is done your folder should look like this:

```
backend/
├── config/
│   └── db.js
├── controllers/
│   ├── authController.js
│   ├── signalController.js
│   ├── emergencyController.js
│   └── adminController.js
├── middleware/
│   ├── authMiddleware.js
│   └── uploadMiddleware.js
├── routes/
│   ├── authRoutes.js
│   ├── signalRoutes.js
│   ├── emergencyRoutes.js
│   └── adminRoutes.js
├── services/
│   ├── auditService.js
│   ├── encryptionService.js
│   ├── watermarkService.js
│   ├── notificationService.js
│   └── expiryService.js
├── uploads/
├── app.js
├── server.js
├── schema.sql
└── .env
```

---

## Summary of API Endpoints

| Method | URL | What it does | Who can use it |
|---|---|---|---|
| POST | /api/auth/login | Login | Everyone |
| POST | /api/auth/register | Create an officer | Admins only |
| POST | /api/auth/logout | Logout | Logged in users |
| GET | /api/signals/inbox | View inbox | Logged in users |
| GET | /api/signals/:id | View a signal | Recipients only |
| POST | /api/signals/:id/acknowledge | Acknowledge | Recipients only |
| POST | /api/signals/create | Create a signal | Admins only |
| POST | /api/emergency/broadcast | Send emergency | Admins only |
| POST | /api/emergency/:id/sms-fallback | Trigger SMS | Senior admins |
| GET | /api/emergency/:id/status | View acknowledgments | Admins only |
| GET | /api/admin/users | List all officers | Admins only |
| GET | /api/admin/devices/pending | Pending devices | Admins only |
| PATCH | /api/admin/devices/:id/approve | Approve device | Admins only |
| GET | /api/admin/audit-logs | View all logs | Admins only |
| POST | /api/admin/trace-watermark | Trace a leaked signal | Admins only |

---

## If You Get Stuck

Common errors and what they mean:

| Error | What it means |
|---|---|
| `Cannot find module` | You typed a file name or path wrong somewhere |
| `ECONNREFUSED` | PostgreSQL is not running — open it from your Start menu |
| `password authentication failed` | Wrong DB password in your .env file |
| `jwt malformed` | The token being sent is broken or missing |
| `relation does not exist` | The database table was not created — re-run schema.sql |
