const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

async function setPassword() {
  const hash = await bcrypt.hash("admin123", 10);
  const pool = new Pool({
    host: "localhost",
    database: "signal_platform",
    user: "postgres",
    password: "bezaleel",
  });
  await pool.query("UPDATE users SET password_hash = $1 WHERE username = $2", [
    hash,
    "admin",
  ]);
  console.log("Password updated to admin123");
  await pool.end();
}

setPassword();
