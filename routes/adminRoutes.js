const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getPendingDevices,
  approveDevice,
  revokeDevice,
  updateUserStatus,
  getAuditLogs,
  traceWatermark,
  downloadSignalReport,
  updateEmergencyAlarmSetting,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/authMiddleware");

// All admin routes require login and admin role
router.use(protect);
router.use(
  authorize("super_admin", "state_command_admin", "area_command_admin"),
);

router.get("/users", getAllUsers);
router.patch("/users/:userId/status", updateUserStatus);
router.get("/devices/pending", getPendingDevices);
router.patch("/devices/:deviceId/approve", approveDevice);
router.patch("/devices/:deviceId/revoke", revokeDevice);
router.get("/audit-logs", getAuditLogs);
router.post("/trace-watermark", traceWatermark);
router.get("/signals/:signalId/report", downloadSignalReport);
router.patch("/settings/emergency-alarm", updateEmergencyAlarmSetting);

module.exports = router;
