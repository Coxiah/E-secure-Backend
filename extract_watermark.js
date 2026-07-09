const watermarkService = require("./services/watermarkService");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/**
 * Tool to extract watermarks from images or text.
 */
async function extract(type, input) {
  if (type === "text") {
    const result = watermarkService.extractTextWatermark(input);
    if (result) {
      console.log("Found Text Watermark Data:");
      console.log(result);
    } else {
      console.log("No text watermark found.");
    }
  } else if (type === "image") {
    console.log("Image watermark extraction requires manual processing or specialized tools to 'bring out' the ghost QR code.");
    console.log("Try enhancing contrast and brightness of the image to make the ghost QR code visible, then scan it.");
    
    // Example of how one might enhance an image to see the watermark
    const enhancedPath = "enhanced_for_scanning.png";
    await sharp(input)
      .modulate({ brightness: 1.5, contrast: 2.0 }) // Increase contrast to reveal ghost QR
      .toFile(enhancedPath);
    console.log(`Enhanced image saved to ${enhancedPath}. Try scanning the QR codes in this image.`);
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: node extract_watermark.js <text|image> <content|path>");
} else {
  extract(args[0], args[1]);
}
