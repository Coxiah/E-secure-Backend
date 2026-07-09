const watermarkService = require("./services/watermarkService");
const fs = require("fs");
const path = require("path");

// Mock data
const signalId = "signal-123";
const userId = "user-456";
const deviceId = "device-789";

async function runTests() {
  console.log("--- Starting Watermark Tests ---");

  // 1. Generate Payload
  const payload = watermarkService.generateWatermarkPayload(signalId, userId, deviceId);
  console.log("Generated Encrypted Payload:", payload);

  // 2. Test Text Watermarking
  const originalText = "This is a highly confidential message.";
  const watermarkedText = watermarkService.embedTextWatermark(originalText, payload);
  console.log("\nOriginal Text Length:", originalText.length);
  console.log("Watermarked Text Length:", watermarkedText.length);
  console.log("Watermarked Text (Visible):", watermarkedText.replace(/[\u200B-\u200F\uFEFF\u2060-\u2064\u202A-\u202E]/g, '[ZW]'));

  const extractedPayload = watermarkService.extractTextWatermark(watermarkedText);
  console.log("Extracted and Decrypted Data:", extractedPayload);

  if (extractedPayload && extractedPayload.includes(signalId) && extractedPayload.includes(userId)) {
    console.log("SUCCESS: Text watermark extracted correctly.");
  } else {
    console.log("FAILURE: Text watermark extraction failed.");
  }

  // 3. Test Image Watermarking
  const testImagePath = path.join(__dirname, "test.png");
  if (fs.existsSync(testImagePath)) {
    try {
      const watermarkedImageBuffer = await watermarkService.embedGhostQR(testImagePath, payload);
      fs.writeFileSync("test_watermarked.png", watermarkedImageBuffer);
      console.log("\nSUCCESS: Watermarked image saved to test_watermarked.png");
    } catch (error) {
      console.error("\nFAILURE: Image watermarking failed:", error);
    }
  } else {
    console.log("\nSKIPPING: test.png not found in current directory.");
  }

  console.log("\n--- Watermark Tests Completed ---");
}

// Mock encryptionService for testing if needed or use real one
// Since we are in the same repo, we can use the real one but need JWT_SECRET
process.env.JWT_SECRET = "test-secret";

runTests();
