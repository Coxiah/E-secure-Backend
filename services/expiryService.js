const cron = require("node-cron");
const pool = require("../config/db");

const startExpiryJob = () => {
  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await pool.query(
        `UPDATE signals SET is_expired = TRUE
         WHERE expiry_time < NOW() AND is_expired = FALSE
         RETURNING signal_number`,
      );
      if (result.rows.length > 0) {
        console.log(`Expired ${result.rows.length} signal(s).`);
      }
    } catch (error) {
      console.error("Expiry job error:", error.message);
    }
  });

  console.log("Signal expiry job started — runs every 5 minutes.");
};

module.exports = { startExpiryJob };
