const QRCode = require("qrcode");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");

const generateWatermarkCode = (signalId, userId) => {
  return `SIG:${signalId}:USR:${userId}:${uuidv4()}`;
};

const saveWatermarkLog = async (signalId, userId, watermarkCode) => {
  await pool.query(
    `INSERT INTO watermark_logs (signal_id, user_id, watermark_code)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [signalId, userId, watermarkCode],
  );
};

const stampQROnImage = async (imagePath, watermarkCode) => {
  const qrBuffer = await QRCode.toBuffer(watermarkCode, {
    width: 100,
    margin: 1,
  });
  const outputBuffer = await sharp(imagePath)
    .composite([{ input: qrBuffer, gravity: "southeast" }])
    .toBuffer();
  return outputBuffer;
};

module.exports = { generateWatermarkCode, saveWatermarkLog, stampQROnImage };
