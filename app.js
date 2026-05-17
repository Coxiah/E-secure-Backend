const express = require("express");
const app = express();
require("dotenv").config();

app.use(express.json());

const authRoutes = require("./routes/authRoutes");
const signalRoutes = require("./routes/signalRoutes");
// const adminRoutes = require('./routes/adminRoutes');
// const emergencyRoutes = require('./routes/emergencyRoutes');

app.use("/api/auth", authRoutes);
app.use("/api/signals", signalRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/emergency', emergencyRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Signal Platform Backend is running" });
});

module.exports = app;
