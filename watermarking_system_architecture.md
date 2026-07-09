# Watermarking System Architecture Design

## 1. Overview
This document outlines the proposed architecture for a robust forensic watermarking system integrated into the `secBackend` application. The primary goal is to embed traceable information into images and messages, ensuring that even if content is leaked via screenshots or re-photography, the source can be identified. The system will leverage a combination of enhanced QR code embedding for images and zero-width character steganography for text messages.

## 2. Core Components

### 2.1. Watermark Generation Service
This service will be responsible for generating the unique watermark payload based on contextual information.

*   **Input**: `signalId`, `userId`, `deviceId`, `timestamp`.
*   **Process**: 
    1.  Concatenate input data into a string (e.g., `SIG:{signalId}:USR:{userId}:DEV:{deviceId}:TS:{timestamp}`).
    2.  Encrypt the concatenated string using the existing `encryptionService` to protect sensitive information.
    3.  Generate a high-error-correction QR code from the encrypted string for image watermarking.
    4.  Generate a zero-width character string from the encrypted data for text message watermarking.
*   **Output**: Encrypted watermark string, QR code buffer, zero-width character string.

### 2.2. Image Watermarking Module
This module will handle the embedding of the generated QR code into image files.

*   **Input**: Image file buffer, QR code buffer, embedding parameters (e.g., opacity, position, tiling).
*   **Process**: 
    1.  Utilize `sharp` (already in use) for image manipulation.
    2.  Instead of a simple overlay, explore advanced embedding techniques to enhance robustness against re-photography and compression.
        *   **Option A (Enhanced Overlay)**: Embed multiple small, low-opacity QR codes in a tiled pattern across the image, or a single larger QR code with very low opacity, strategically placed. This makes it less visible but still detectable with image processing tools.
        *   **Option B (Pixel Manipulation)**: Investigate methods to subtly alter pixel values in the image based on the QR code data, potentially in the frequency domain (e.g., Discrete Cosine Transform - DCT), to make the watermark more resilient. This might require external libraries or custom implementations.
    3.  The goal is to make the QR code visually imperceptible or minimally intrusive, yet robust enough to survive common leakage methods.
*   **Output**: Watermarked image file buffer.

### 2.3. Message Watermarking Module
This module will embed the zero-width character watermark into text messages.

*   **Input**: Original text message, zero-width character string.
*   **Process**: 
    1.  Integrate with a library like `text-blind-watermark-js`.
    2.  Embed the zero-width character string into the text message at strategic, non-disruptive locations.
*   **Output**: Watermarked text message string.

### 2.4. Watermark Detection and Extraction Service
This service will be responsible for detecting and extracting watermarks from leaked content.

*   **Input**: Suspected leaked image or text message.
*   **Process**: 
    1.  **For Images**: 
        *   Apply image processing techniques to enhance and detect the embedded QR code (e.g., contrast adjustment, noise reduction, QR code detection algorithms).
        *   Extract the encrypted watermark string from the detected QR code.
    2.  **For Messages**: 
        *   Scan the text for zero-width characters.
        *   Extract the zero-width character string.
    3.  Decrypt the extracted watermark string using the `encryptionService`.
    4.  Parse the decrypted string to retrieve `signalId`, `userId`, `deviceId`, and `timestamp`.
*   **Output**: Decrypted watermark information (`signalId`, `userId`, `deviceId`, `timestamp`) or an indication of no watermark found.

## 3. Integration with `secBackend`

*   **`signalController.js`**: Modify to call the Watermark Generation Service before sending images or messages. The watermarked content will then be stored or transmitted.
*   **`watermarkService.js`**: Refactor the existing `watermarkService.js` to incorporate the new Watermark Generation, Image Watermarking, and Message Watermarking modules.
*   **Database**: Update `watermark_logs` table to include `deviceId` and `timestamp` for comprehensive tracing.

## 4. Considerations for Robustness and Imperceptibility

*   **Image Watermarking**: Extensive testing will be required to balance the visibility and robustness of the QR code. Experiment with different sizes, opacities, and tiling patterns. If a QR code proves insufficient, further research into DWT/DCT based methods will be necessary.
*   **Text Watermarking**: Ensure that the zero-width characters do not interfere with text rendering across different platforms and fonts. The `text-blind-watermark-js` library claims to address mobile compatibility issues.
*   **Encryption**: The use of encryption ensures that the embedded information is not easily readable without the decryption key.
*   **Performance**: The watermarking process should be efficient enough not to introduce significant latency in content delivery.

## 5. Future Enhancements

*   **Adaptive Watermarking**: Dynamically adjust watermarking parameters based on image content or message length.
*   **Perceptual Hashing**: Combine watermarking with perceptual hashing to detect content modifications.
*   **Advanced Steganography**: Explore more sophisticated steganographic techniques for both images and text.

