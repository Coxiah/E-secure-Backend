const pool = require("../config/db");
const { encrypt } = require("../services/encryptionService");
const {
  sendSMS,
  sendPushNotification,
} = require("../services/notificationService");
const { logAction } = require("../services/auditService");

const sendEmergencyBroadcast = async (req, res) => {
  const { title, content, recipientIds } = req.body;
  const senderId = req.user.id;

  try {
    // Get SMS fallback setting
    const settingResult = await pool.query(
      `SELECT value FROM settings WHERE key = 'sms_fallback_mode'`,
    );
    const smsFallbackMode = settingResult.rows[0]?.value || "manual";

    // Create emergency signal
    const countResult = await pool.query("SELECT COUNT(*) FROM signals");
    const signalNumber = `EMG-${new Date().getFullYear()}-${String(Number(countResult.rows[0].count) + 1).padStart(4, "0")}`;

    const encryptedContent = Buffer.from(encrypt(content));

    const signalResult = await pool.query(
      `INSERT INTO signals (signal_number, title, content_type, content_encrypted, classification, sender_id)
       VALUES ($1, $2, 'text', $3, 'emergency', $4) RETURNING *`,
      [signalNumber, title, encryptedContent, senderId],
    );

    const signal = signalResult.rows[0];

    // Determine recipients
    let recipients = [];
    if (recipientIds && recipientIds.length > 0) {
      const result = await pool.query(
        `SELECT id, phone FROM users WHERE id = ANY($1::uuid[]) AND status = 'active'`,
        [recipientIds],
      );
      recipients = result.rows;
    } else {
      const result = await pool.query(
        `SELECT id, phone FROM users WHERE status = 'active'`,
      );
      recipients = result.rows;
    }

    // Process each recipient
    for (const recipient of recipients) {
      await pool.query(
        `INSERT INTO signal_recipients (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [signal.id, recipient.id],
      );
      await pool.query(
        `INSERT INTO signal_receipts (signal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [signal.id, recipient.id],
      );

      await sendPushNotification(recipient.id, `EMERGENCY: ${title}`, content, {
        signalId: signal.id,
        type: "emergency",
      });

      if (smsFallbackMode === "auto") {
        await sendSMS(
          recipient.phone,
          `EMERGENCY SIGNAL [${signalNumber}]: ${title}. Open the Signal Platform app immediately.`,
        );
        await pool.query(
          `UPDATE signal_receipts SET delivery_method = 'sms' WHERE signal_id = $1 AND user_id = $2`,
          [signal.id, recipient.id],
        );
      }
    }

    await logAction({
      userId: senderId,
      action: "EMERGENCY_BROADCAST",
      entityType: "signal",
      entityId: signal.id,
      ipAddress: req.ip,
      metadata: { recipientCount: recipients.length, smsFallbackMode },
    });

    res.status(201).json({
      message: "Emergency broadcast sent.",
      signalNumber,
      recipientCount: recipients.length,
      signalId: signal.id,
    });
  } catch (error) {
    console.error("Emergency broadcast error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

const triggerSmsFallback = async (req, res) => {
  const { signalId } = req.params;
  try {
    const signalResult = await pool.query(
      `SELECT * FROM signals WHERE id = $1`,
      [signalId],
    );
    const signal = signalResult.rows[0];
    if (!signal) return res.status(404).json({ message: "Signal not found." });

    const pendingResult = await pool.query(
      `SELECT u.phone, sr.user_id FROM signal_receipts sr
       JOIN users u ON u.id = sr.user_id
       WHERE sr.signal_id = $1 AND sr.acknowledged_at IS NULL`,
      [signalId],
    );

    for (const recipient of pendingResult.rows) {
      await sendSMS(
        recipient.phone,
        `EMERGENCY SIGNAL [${signal.signal_number}]: ${signal.title}. Open the Signal Platform app immediately.`,
      );
      await pool.query(
        `UPDATE signal_receipts SET delivery_method = 'sms' WHERE signal_id = $1 AND user_id = $2`,
        [signalId, recipient.user_id],
      );
    }

    res.json({
      message: `SMS sent to ${pendingResult.rows.length} pending recipients.`,
    });
  } catch (error) {
    console.error("SMS fallback error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

const getEmergencyStatus = async (req, res) => {
  const { signalId } = req.params;
  try {
    const result = await pool.query(
      `SELECT u.full_name, u.rank, u.unit, sr.delivered_at, sr.viewed_at, sr.acknowledged_at, sr.delivery_method
       FROM signal_receipts sr
       JOIN users u ON u.id = sr.user_id
       WHERE sr.signal_id = $1
       ORDER BY sr.acknowledged_at ASC NULLS LAST`,
      [signalId],
    );
    res.json({ recipients: result.rows });
  } catch (error) {
    console.error("Emergency status error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

module.exports = {
  sendEmergencyBroadcast,
  triggerSmsFallback,
  getEmergencyStatus,
};
