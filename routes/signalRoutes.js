const express = require("express");
const router = express.Router();
const {
  createSignal,
  getInbox,
  viewSignal,
  acknowledgeSignal,
  logScreenshot,
} = require("../controllers/signalController");
const { protect, authorize } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.use(protect);

router.get("/inbox", getInbox);
router.get("/:id", viewSignal);
router.post("/:id/acknowledge", acknowledgeSignal);
router.post("/screenshot", logScreenshot);
router.post(
  "/create",
  authorize("super_admin", "state_command_admin", "area_command_admin"),
  upload.single("file"),
  createSignal,
);

module.exports = router;
