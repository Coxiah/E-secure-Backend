const pool = require("../config/db");

const logAction = async ({
  userId,
  action,
  entityType,
  entityId,
  ipAddress,
  metadata,
}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        action,
        entityType,
        entityId,
        ipAddress,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (error) {
    console.error("Audit log error:", error.message);
  }
};

module.exports = { logAction };
