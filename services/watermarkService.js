const QRCode = require("qrcode");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");
const encryptionService = require("./encryptionService");

/**
 * Generates a forensic watermark payload.
 * @param {string} signalId - The ID of the signal/message.
 * @param {string} userId - The ID of the user.
 * @param {string} deviceId - The ID of the device.
 * @returns {string} - Encrypted watermark payload.
 */
const generateWatermarkPayload = (signalId, userId, deviceId) => {
  const timestamp = new Date().toISOString();
  const rawData = `SIG:${signalId}|USR:${userId}|DEV:${deviceId}|TS:${timestamp}|UUID:${uuidv4()}`;
  return encryptionService.encrypt(rawData);
};

/**
 * Saves a watermark log to the database.
 */
const saveWatermarkLog = async (signalId, userId, deviceId, watermarkPayload) => {
  try {
    await pool.query(
      `INSERT INTO watermark_logs (signal_id, user_id, device_id, watermark_code)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [signalId, userId, deviceId, watermarkPayload]
    );
  } catch (error) {
    console.error("Error saving watermark log:", error);
  }
};

/**
 * Embeds a "ghost" QR code watermark into an image.
 * This is designed to be barely visible but detectable via image processing.
 */
const embedGhostQR = async (imagePath, encryptedPayload) => {
  // Use high error correction to survive some distortion/re-photography
  const qrBuffer = await QRCode.toBuffer(encryptedPayload, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 250,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  // Create a semi-transparent version of the QR code
  const transparentQR = await sharp(qrBuffer)
    .ensureAlpha(0.03) // Set extremely low opacity (3%) for "ghost" effect
    .toBuffer();

  // Composite the QR code onto the image (tiled or strategically placed)
  const image = sharp(imagePath);
  
  // Using 'soft-light' or 'overlay' blend modes can make the watermark even more subtle
  // while still being recoverable via image processing (e.g., contrast enhancement).
  const compositeOptions = [
    { input: transparentQR, gravity: "northwest", blend: "soft-light" },
    { input: transparentQR, gravity: "northeast", blend: "soft-light" },
    { input: transparentQR, gravity: "southwest", blend: "soft-light" },
    { input: transparentQR, gravity: "southeast", blend: "soft-light" },
    { input: transparentQR, gravity: "center", blend: "soft-light" }
  ];

  const outputBuffer = await image
    .composite(compositeOptions)
    .toBuffer();

  return outputBuffer;
};

/**
 * Embeds a zero-width character watermark into text.
 * This is for messages.
 */
const embedTextWatermark = (text, encryptedPayload) => {
  // Zero-width characters mapping
  const zwChars = {
    '0': '\u200B', // Zero Width Space
    '1': '\u200C', // Zero Width Non-Joiner
    '2': '\u200D', // Zero Width Joiner
    '3': '\u200E', // Left-To-Right Mark
    '4': '\u200F', // Right-To-Left Mark
    '5': '\uFEFF', // Byte Order Mark
    '6': '\u2060', // Word Joiner
    '7': '\u2061', // Function Application
    '8': '\u2062', // Invisible Times
    '9': '\u2063', // Invisible Separator
    'a': '\u2064', // Invisible Plus
    'b': '\u202A', // LRE
    'c': '\u202B', // RLE
    'd': '\u202C', // PDF
    'e': '\u202D', // LRO
    'f': '\u202E'  // RLO
  };

  const hexPayload = Buffer.from(encryptedPayload).toString('hex');
  let zwString = '';
  for (let char of hexPayload) {
    zwString += zwChars[char] || '';
  }

  // Insert at the beginning of the text
  return zwString + text;
};

/**
 * Extracts a zero-width character watermark from text.
 */
const extractTextWatermark = (watermarkedText) => {
  const zwCharsRev = {
    '\u200B': '0',
    '\u200C': '1',
    '\u200D': '2',
    '\u200E': '3',
    '\u200F': '4',
    '\uFEFF': '5',
    '\u2060': '6',
    '\u2061': '7',
    '\u2062': '8',
    '\u2063': '9',
    '\u2064': 'a',
    '\u202A': 'b',
    '\u202B': 'c',
    '\u202C': 'd',
    '\u202D': 'e',
    '\u202E': 'f'
  };

  let hexPayload = '';
  for (let char of watermarkedText) {
    if (zwCharsRev[char]) {
      hexPayload += zwCharsRev[char];
    }
  }

  if (!hexPayload) return null;

  try {
    const encryptedPayload = Buffer.from(hexPayload, 'hex').toString();
    const decryptedData = encryptionService.decrypt(encryptedPayload);
    return decryptedData;
  } catch (e) {
    console.error("Failed to decrypt watermark:", e);
    return null;
  }
};

module.exports = {
  generateWatermarkPayload,
  saveWatermarkLog,
  embedGhostQR,
  embedTextWatermark,
  extractTextWatermark
};
