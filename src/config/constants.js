/**
 * Constants for the AsteroidServer logic.
 */

// Algorithms and Decryption Configs
const XOR_KEY = process.env.XOR_KEY;
const SALT = process.env.SALT;
const SIGNATURE_SEPARATOR = '(>w<)';
const SEED_SEPARATOR = '@@@';

// Game Metrics and Configs
const MAX_SCORE_PER_MINUTE = {
    TIME_BOUND: 500000,
    ENDLESS: 300000,
    CLASSIC: 400000
};
const MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024;

module.exports = {
    XOR_KEY,
    SALT,
    SIGNATURE_SEPARATOR,
    SEED_SEPARATOR,
    MAX_SCORE_PER_MINUTE,
    MAX_DECOMPRESSED_BYTES
};
