const crypto = require('crypto');

// Generate a random 256-bit (32 byte) key for AES-256 on server startup
const aesKey = crypto.randomBytes(32);

/**
 * Encrypt the global AES key using a client's RSA public key.
 * @param {string} clientPublicKey - The client's RSA public key (PEM format).
 * @returns {string} - Base64 encoded RSA-encrypted AES key.
 */
const getEncryptedAesKey = (clientPublicKey) => {
    try {
        const encrypted = crypto.publicEncrypt(
            clientPublicKey, // Will use default padding (often RSA_PKCS1_PADDING or OAEP)
            aesKey
        );
        return encrypted.toString('base64');
    } catch (error) {
        throw new Error('Failed to encrypt AES key with given public key. Ensure the key format is correct (PEM).');
    }
};

/**
 * Decrypt an AES-256-CBC encrypted payload that has the IV prepended.
 * @param {string} base64Payload - The Base64 encoded ciphertext (IV + encrypted data).
 * @returns {string} - The decrypted UTF-8 string (ready for internal decoding/verification).
 */
const decryptPayload = (base64Payload) => {
    try {
        const dataBuf = Buffer.from(base64Payload, 'base64');

        // IV is the first 16 bytes for AES CBC
        if (dataBuf.length < 16) {
            throw new Error('Payload too short to contain AES IV.');
        }

        const iv = dataBuf.subarray(0, 16);
        const encryptedText = dataBuf.subarray(16);

        const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);

        let decrypted = decipher.update(encryptedText, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        throw new Error(`Failed to decrypt AES payload: ${error.message}`);
    }
};

module.exports = {
    getEncryptedAesKey,
    decryptPayload
};
