# Forensic Watermarking Implementation Summary

## 1. Features Implemented
*   **Encrypted Forensic Payload**: Watermarks now include `signalId`, `userId`, `deviceId`, and `timestamp`, all encrypted using the existing `encryptionService`.
*   **Ghost QR Image Watermarking**: 
    *   Uses high-error-correction (Level H) QR codes.
    *   Embedded with extremely low opacity (3%) and 'soft-light' blend mode.
    *   Tiled across 5 positions (corners and center) for maximum redundancy.
    *   Designed to be barely visible to the naked eye but recoverable through image enhancement.
*   **Zero-Width Text Watermarking**:
    *   Hides the encrypted payload within text messages using 16 different Unicode zero-width characters.
    *   Completely invisible in standard text viewers.
    *   Survives copy-pasting in most modern environments.
*   **Tracing Capability**: Includes an extraction tool to recover data from leaked text and a guide for recovering data from images.

## 2. Files Modified/Created
*   `services/watermarkService.js`: Completely rewritten with advanced watermarking logic.
*   `controllers/signalController.js`: Updated to integrate the new watermarking flow for both text and images.
*   `test_watermark.js`: A comprehensive test suite to verify the implementation.
*   `extract_watermark.js`: A utility for extracting watermarks from leaked content.

## 3. How to Use
*   **Sending Signals**: The system automatically watermarks images and text when a user views a signal.
*   **Tracing Leaks**:
    *   For **Text**: Use `node extract_watermark.js text "leaked text here"`.
    *   For **Images**: Enhance the leaked image's contrast/brightness to reveal the ghost QR codes, then scan them with any standard QR reader.

## 4. Security Notes
*   The system relies on the `JWT_SECRET` for encryption. Ensure this secret is kept secure.
*   The `deviceId` is captured from the `x-device-id` header in requests.
