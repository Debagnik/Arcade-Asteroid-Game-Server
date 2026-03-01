const crypto = require('crypto');
const { XOR_KEY, SALT, SIGNATURE_SEPARATOR } = require('../config/constants');

/**
 * Verifies and decodes the gameScore payload based on the agreed pipeline:
 * JSON -> Base64 -> Salt -> XOR -> Base64 + Separator + SHA256 Signature
 * 
 * @param {string} fullPayload The raw string from the request body
 * @returns {object} The parsed JSON object
 * @throws {Error} If signature is invalid or decoding fails
 */
const decodeAndVerifyScore = (fullPayload) => {
    if (!fullPayload || typeof fullPayload !== 'string') {
        throw new Error('Invalid payload format.');
    }

    const parts = fullPayload.split(SIGNATURE_SEPARATOR);
    if (parts.length !== 2) {
        throw new Error('Payload does not contain the expected signature separator.');
    }

    const encodedData = parts[0];
    const signature = parts[1];

    // 1. Verify SHA-256 Checksum Signature (No HMAC, just regular SHA256 hash of the encoded data)
    const hash = crypto.createHash('sha256').update(encodedData).digest('hex');
    if (hash !== signature) {
        throw new Error('Signature verification failed! Payload may have been tampered with.');
    }

    // 2. Second Base64 Decode (Base64 -> XORed bytes)
    const xorMaskedBuf = Buffer.from(encodedData, 'base64');

    // 3. XOR Unmasking
    let xoredString = '';
    const xorKeyBuf = Buffer.from(XOR_KEY, 'utf-8');
    for (let i = 0; i < xorMaskedBuf.length; i++) {
        // We assume XOR_KEY was applied cyclically to the bytes
        xoredString += String.fromCharCode(xorMaskedBuf[i] ^ xorKeyBuf[i % xorKeyBuf.length]);
    }

    // 4. Remove Salt Addition
    // Assuming salt was appended (`string + SALT`)
    let firstBase64String = xoredString;
    if (xoredString.endsWith(SALT)) {
        firstBase64String = xoredString.slice(0, -SALT.length);
    } else {
        // Could also try to replace if it was injected differently, but standard "salt addition" 
        // implies append or prepend. Let's strictly attempt to remove trailing or leading.
        if (xoredString.startsWith(SALT)) {
            firstBase64String = xoredString.slice(SALT.length);
        }
    }

    // 5. First Base64 Decode
    const jsonString = Buffer.from(firstBase64String, 'base64').toString('utf-8');

    // 6. JSON Parse
    try {
        return JSON.parse(jsonString);
    } catch (err) {
        throw new Error('Failed to parse decoded payload as JSON.');
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
