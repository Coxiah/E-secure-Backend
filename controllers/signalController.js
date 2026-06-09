const pool = require("../config/db");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { encrypt, decrypt } = require("../services/encryptionService");
const {
  generateWatermarkCode,
  saveWatermarkLog,
  stampQROnImage,
} = require("../services/watermarkService");
const { logAction } = require("../services/auditService");
const eventService = require("../services/eventService");

const getInbox = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT s.id, s.signal_number, s.title, s.classification, s.content_type, s.created_at
       FROM signals s
       JOIN signal_recipients sr ON sr.signal_id = s.id
       WHERE sr.user_id = $1
       ORDER BY s.created_at DESC`,
      [userId],
    );
    res.json({ signals: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const createSignal = async (req, res) => {
  const { title, contentType, classification, expiryTime } = req.body;
  let { content, recipientIds } = req.body;
  const senderId = req.user.id;

  if (typeof recipientIds === "string") {
    recipientIds = [recipientIds];
  }
  if (!recipientIds || !recipientIds.length) {
    return res.status(400).json({ message: "Recipient IDs required" });
  }

  try {
    const countResult = await pool.query("SELECT COUNT(*) FROM signals");
    const signalNumber = `SIG-${new Date().getFullYear()}-${String(Number(countResult.rows[0].count) + 1).padStart(4, "0")}`;

    let encryptedContent = null;
    let filePath = null;

    if (contentType === "text" && content) {
      encryptedContent = Buffer.from(encrypt(content));
    }
    if (req.file) {
      filePath = req.file.path;
    }

    const signalResult = await pool.query(
      `INSERT INTO signals (signal_number, title, content_type, content_encrypted, file_path, classification, sender_id, expiry_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        signalNumber,
        title,
        contentType,
        encryptedContent,
        filePath,
        classification || "confidential",
        senderId,
        expiryTime || null,
      ],
    );

    const signalId = signalResult.rows[0].id;

    for (const recipientId of recipientIds) {
      await pool.query(
        "INSERT INTO signal_recipients (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [signalId, recipientId],
      );
      await pool.query(
        "INSERT INTO signal_receipts (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [signalId, recipientId],
      );
      // Emit real-time event for each recipient
      eventService.emitNewSignal(recipientId, {
        signalId,
        signalNumber,
        title,
        classification,
      });
    }

    res.status(201).json({ message: "Signal created", signalId, signalNumber });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const viewSignal = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const recipientCheck = await pool.query(
      "SELECT 1 FROM signal_recipients WHERE signal_id = $1 AND user_id = $2",
      [id, userId],
    );
    if (recipientCheck.rows.length === 0) {
      return res
        .status(403)
        .json({ message: "You do not have access to this signal." });
    }

    const signalResult = await pool.query(
      "SELECT * FROM signals WHERE id = $1",
      [id],
    );
    const signal = signalResult.rows[0];
    if (!signal) return res.status(404).json({ message: "Signal not found." });

    if (
      signal.is_expired ||
      (signal.expiry_time && new Date(signal.expiry_time) < new Date())
    ) {
      return res.status(410).json({
        message: "This signal has expired and can no longer be viewed.",
      });
    }

    const watermarkCode = generateWatermarkCode(id, userId);
    await saveWatermarkLog(id, userId, watermarkCode);

    await pool.query(
      `UPDATE signal_receipts SET viewed_at = NOW(), delivery_method = 'push'
       WHERE signal_id = $1 AND user_id = $2 AND viewed_at IS NULL`,
      [id, userId],
    );

    await logAction({
      userId,
      action: "SIGNAL_VIEWED",
      entityType: "signal",
      entityId: id,
      ipAddress: req.ip,
    });

    let responseData = {
      id: signal.id,
      signalNumber: signal.signal_number,
      title: signal.title,
      classification: signal.classification,
      contentType: signal.content_type,
      createdAt: signal.created_at,
      expiryTime: signal.expiry_time,
      watermarkCode,
    };

    if (signal.content_type === "text" && signal.content_encrypted) {
      responseData.content = decrypt(signal.content_encrypted.toString());
    }

    if (signal.content_type === "image" && signal.file_path) {
      const watermarkedImageBuffer = await stampQROnImage(
        signal.file_path,
        watermarkCode,
      );
      responseData.imageData = watermarkedImageBuffer.toString("base64");
    }

    if (signal.content_type === "pdf" || signal.content_type === "audio") {
      responseData.fileUrl = `/api/signals/${id}/file?token=${req.headers.authorization?.split(" ")[1]}`;
    }

    res.json(responseData);
  } catch (error) {
    console.error("View signal error:", error.message);
    res.status(500).json({ message: "Server error." });
  }
};

const acknowledgeSignal = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    await pool.query(
      `UPDATE signal_receipts SET acknowledged_at = NOW()
       WHERE signal_id = $1 AND user_id = $2 AND acknowledged_at IS NULL`,
      [id, userId],
    );

    await logAction({
      userId,
      action: "SIGNAL_ACKNOWLEDGED",
      entityType: "signal",
      entityId: id,
      ipAddress: req.ip,
    });

    // Emit real-time acknowledgment event
    eventService.emitAcknowledgment(id, userId, new Date().toISOString());

    res.json({ message: "Signal acknowledged." });
  } catch (error) {
    console.error("Acknowledge error:", error.message);
    res.status(500).json({ message: "Server error." });
  }
};

const logScreenshot = async (req, res) => {
  const { signalId } = req.body;
  const userId = req.user.id;

  try {
    await pool.query(
      `INSERT INTO screenshot_logs (user_id, signal_id, ip_address) VALUES ($1, $2, $3)`,
      [userId, signalId || null, req.ip],
    );
    await logAction({
      userId,
      action: "SCREENSHOT_DETECTED",
      entityType: "signal",
      entityId: signalId,
      ipAddress: req.ip,
    });
    res.json({ message: "Logged." });
  } catch (error) {
    console.error("Screenshot log error:", error.message);
    res.status(500).json({ message: "Server error." });
  }
};

const serveFile = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const recipientCheck = await pool.query(
      "SELECT 1 FROM signal_recipients WHERE signal_id = $1 AND user_id = $2",
      [id, userId],
    );
    if (recipientCheck.rows.length === 0) {
      return res.status(403).json({ message: "Access denied." });
    }

    const signalResult = await pool.query(
      "SELECT file_path, content_type FROM signals WHERE id = $1",
      [id],
    );
    const signal = signalResult.rows[0];
    if (!signal || !signal.file_path) {
      return res.status(404).json({ message: "File not found." });
    }

    const fullPath = path.join(process.cwd(), signal.file_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: "File missing on server." });
    }

    await logAction({
      userId,
      action: "FILE_DOWNLOADED",
      entityType: "signal",
      entityId: id,
      ipAddress: req.ip,
    });

    let contentType = "application/octet-stream";
    if (signal.content_type === "pdf") contentType = "application/pdf";
    if (signal.content_type === "image") contentType = "image/jpeg";
    if (signal.content_type === "audio") contentType = "audio/mpeg";
    res.setHeader("Content-Type", contentType);
    res.sendFile(fullPath);
  } catch (error) {
    console.error("File serve error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

module.exports = {
  getInbox,
  createSignal,
  viewSignal,
  acknowledgeSignal,
  logScreenshot,
  serveFile,
};
