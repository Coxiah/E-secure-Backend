// services/notificationService.js
const sendSMS = async (phoneNumber, message) => {
  console.log(`[SMS placeholder] To: ${phoneNumber} | Message: ${message}`);
  return { success: true };
};

const sendPushNotification = async (deviceToken, title, body, data = {}) => {
  console.log(`[Push placeholder] To: ${deviceToken} | Title: ${title}`);
  return { success: true };
};

module.exports = { sendSMS, sendPushNotification };
