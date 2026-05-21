const express = require("express");
const router = express.Router();
const {
  sendEmergencyBroadcast,
  triggerSmsFallback,
  getEmergencyStatus,
} = require("../controllers/emergencyController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect);

router.post(
  "/broadcast",
  authorize("super_admin", "state_command_admin", "area_command_admin"),
  sendEmergencyBroadcast,
);
router.post(
  "/:signalId/sms-fallback",
  authorize("super_admin", "state_command_admin"),
  triggerSmsFallback,
);
router.get(
  "/:signalId/status",
  authorize("super_admin", "state_command_admin", "area_command_admin"),
  getEmergencyStatus,
);

module.exports = router;
