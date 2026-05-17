const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { logAction } = require("../services/auditService");
require("dotenv").config();

const login = async (req, res) => {
  const { username, password, deviceId, deviceModel, osVersion } = req.body;
  const ipAddress = req.ip;

  try {
    const userResult = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username],
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const user = userResult.rows[0];

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Your account has been suspended. Contact your admin.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await logAction({ userId: user.id, action: "FAILED_LOGIN", ipAddress });
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN },
    );

    await logAction({ userId: user.id, action: "LOGIN", ipAddress });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        rank: user.rank,
        unit: user.unit,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

const logout = async (req, res) => {
  await logAction({ userId: req.user.id, action: "LOGOUT", ipAddress: req.ip });
  res.json({ message: "Logged out successfully." });
};

module.exports = { login, logout };
