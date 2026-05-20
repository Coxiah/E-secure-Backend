const pool = require("../config/db");
const { logAction } = require("../services/auditService");

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, full_name, rank, unit, phone, username, role, status, created_at FROM users ORDER BY created_at DESC",
    );
    res.json({ users: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get pending devices
const getPendingDevices = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.full_name, u.rank, u.unit 
       FROM devices d 
       JOIN users u ON u.id = d.user_id
       WHERE d.status = 'pending'
       ORDER BY d.registered_at DESC`,
    );
    res.json({ devices: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Approve a device
const approveDevice = async (req, res) => {
  const { deviceId } = req.params;
  try {
    // Get user_id for this device
    const deviceResult = await pool.query(
      "SELECT user_id FROM devices WHERE id = $1",
      [deviceId],
    );
    if (deviceResult.rows.length === 0)
      return res.status(404).json({ message: "Device not found" });
    const userId = deviceResult.rows[0].user_id;

    // Revoke any other approved device for this user
    await pool.query(
      "UPDATE devices SET status = 'revoked' WHERE user_id = $1 AND status = 'approved'",
      [userId],
    );

    // Approve this device
    await pool.query("UPDATE devices SET status = 'approved' WHERE id = $1", [
      deviceId,
    ]);

    await logAction({
      userId: req.user.id,
      action: "DEVICE_APPROVED",
      entityType: "device",
      entityId: deviceId,
      ipAddress: req.ip,
    });

    res.json({ message: "Device approved successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Revoke a device
const revokeDevice = async (req, res) => {
  const { deviceId } = req.params;
  try {
    await pool.query("UPDATE devices SET status = 'revoked' WHERE id = $1", [
      deviceId,
    ]);
    await logAction({
      userId: req.user.id,
      action: "DEVICE_REVOKED",
      entityType: "device",
      entityId: deviceId,
      ipAddress: req.ip,
    });
    res.json({ message: "Device revoked." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update user status (suspend/activate)
const updateUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body; // 'active', 'suspended', 'deactivated'
  try {
    await pool.query("UPDATE users SET status = $1 WHERE id = $2", [
      status,
      userId,
    ]);
    await logAction({
      userId: req.user.id,
      action: `USER_STATUS_${status.toUpperCase()}`,
      entityType: "user",
      entityId: userId,
      ipAddress: req.ip,
    });
    res.json({ message: `User status updated to ${status}.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get audit logs
const getAuditLogs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.full_name, u.rank 
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT 100`,
    );
    res.json({ logs: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Trace watermark (leak investigation)
const traceWatermark = async (req, res) => {
  const { watermarkCode } = req.body;
  try {
    const result = await pool.query(
      `SELECT wl.*, u.full_name, u.rank, u.unit, u.phone, s.signal_number, s.title
       FROM watermark_logs wl
       JOIN users u ON u.id = wl.user_id
       JOIN signals s ON s.id = wl.signal_id
       WHERE wl.watermark_code = $1`,
      [watermarkCode],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Watermark not found." });
    }
    const trace = result.rows[0];
    res.json({
      message: "Watermark traced successfully.",
      leakSource: {
        officerName: trace.full_name,
        rank: trace.rank,
        unit: trace.unit,
        phone: trace.phone,
        signalNumber: trace.signal_number,
        signalTitle: trace.title,
        viewedAt: trace.generated_at,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAllUsers,
  getPendingDevices,
  approveDevice,
  revokeDevice,
  updateUserStatus,
  getAuditLogs,
  traceWatermark,
};
