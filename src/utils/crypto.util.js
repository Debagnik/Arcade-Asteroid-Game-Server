const crypto = require('crypto');
const lzma = require('lzma-native');
const { XOR_KEY, SALT, SIGNATURE_SEPARATOR, MAX_DECOMPRESSED_BYTES } = require('../config/constants');

/**
 * Verifies and decodes the gameScore payload based on the agreed pipeline:
 * LZMA2 -> Base64 -> Salt -> XOR -> Base64 + Separator + SHA256 Signature
 * 
 * @param {string} fullPayload The raw string from the request body
 * @param {string} customXorKey Optional. Defaults to project XOR_KEY. Used for pepper logic.
 * @returns {Promise<object>} The parsed JSON object
 * @throws {Error} If signature is invalid or decoding fails
 */
const decodeAndVerifyScore = async (fullPayload, customXorKey = XOR_KEY) => {
    if (!fullPayload || typeof fullPayload !== 'string') {
        throw new Error('Invalid payload format.');
    }

    // Step 1: Split Checksum and Payload
    const parts = fullPayload.split(SIGNATURE_SEPARATOR);
    if (parts.length !== 2) {
        throw new Error('Payload does not contain the expected signature separator.');
    }

    const protectedData = parts[0];
    const providedChecksum = parts[1];

    // Step 2: Verify Checksum (SHA-256)
    const hash = crypto.createHash('sha256').update(protectedData).digest('hex');
    if (hash !== providedChecksum.toLowerCase()) {
        throw new Error('Signature verification failed! Payload may have been tampered with.');
    }

    // Step 3: Base64 Decode (Outer Layer)
    const xoredBytes = Buffer.from(protectedData, 'base64');

    // Step 4: Undo XOR Masking
    let saltedBase64String = '';
    const xorKeyBuf = Buffer.from(customXorKey, 'utf-8');
    for (let i = 0; i < xoredBytes.length; i++) {
        saltedBase64String += String.fromCharCode(xoredBytes[i] ^ xorKeyBuf[i % xorKeyBuf.length]);
    }

    // Step 5: Verify and Strip Salt
    if (!saltedBase64String.endsWith(SALT)) {
        throw new Error('Salt verification failed. Payload is invalid or corrupted.');
    }
    const innerBase64String = saltedBase64String.slice(0, -SALT.length);

    // Step 6: Base64 Decode (Inner Layer)
    const compressedBytes = Buffer.from(innerBase64String, 'base64');

    // Step 7: Decompress (XZ / LZMA2)
    let jsonString;
    try {
        const decompressedBuffer = await new Promise((resolve, reject) => {
            const decompressor = lzma.createDecompressor();
            const chunks = [];
            let totalSize = 0;

            decompressor.on('data', (chunk) => {
                totalSize += chunk.length;
                if (totalSize > MAX_DECOMPRESSED_BYTES) {
                    const err = new Error('Payload exceeds maximum decompressed size (zip bomb protection).');
                    decompressor.destroy(err);
                    reject(err);
                } else {
                    chunks.push(chunk);
                }
            });

            decompressor.on('error', (err) => reject(err));
            decompressor.on('end', () => resolve(Buffer.concat(chunks)));

            decompressor.end(compressedBytes);
        });
        jsonString = decompressedBuffer.toString('utf-8');
    } catch (err) {
        console.error(`[Crypto Util - decodeAndVerifyScore] Decompression error:`, err.message);
        console.error(`[Crypto Util - decodeAndVerifyScore] Error stack:`, err.stack);
        throw new Error('Failed to decompress LZMA2 payload: ' + err.message);
    }

    // Step 8: Parse JSON
    try {
        return JSON.parse(jsonString);
    } catch (err) {
        console.error(`[Crypto Util - decodeAndVerifyScore] JSON parse error:`, err.message);
        console.error(`[Crypto Util - decodeAndVerifyScore] Error stack:`, err.stack);
        throw new Error('Failed to parse decompressed payload as JSON.');
    }
};

/**
 * Generate a UUIDv3 equivalent to Java's UUID.nameUUIDFromBytes
 */
const nameUUIDFromBytes = (nameStr) => {
    const hash = crypto.createHash('md5').update(nameStr, 'utf8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x30; // V3
    hash[8] = (hash[8] & 0x3f) | 0x80; // Variant

    return [
        hash.toString('hex', 0, 4),
        hash.toString('hex', 4, 6),
        hash.toString('hex', 6, 8),
        hash.toString('hex', 8, 10),
        hash.toString('hex', 10, 16)
    ].join('-');
};

module.exports = {
    decodeAndVerifyScore,
    nameUUIDFromBytes
};
