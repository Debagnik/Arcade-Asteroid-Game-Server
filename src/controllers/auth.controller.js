const jwt = require('jsonwebtoken');

const generateToken = (req, res) => {
    try {
        console.log(`[Auth API - generateToken] Received request to generate token`);
        const expiresIn = process.env.JWT_EXPIRES_IN ? parseInt(process.env.JWT_EXPIRES_IN) : 3600;
        const secret = process.env.JWT_SECRET || 'fallback_secret';

        // Simply generate a token. Payload can be empty or generic for a simple server-to-server interaction.
        const token = jwt.sign({ role: 'client' }, secret, {
            expiresIn: expiresIn // This accepts numbers as seconds or strings like "1h"
        });

        const responseData = {
            message: 'Token generated successfully',
            token: token,
            expiresIn: expiresIn
        };
        console.log(`[Auth API - generateToken] Responding back with token data:`, responseData);
        res.status(200).json(responseData);
    } catch (error) {
        console.error(`[Auth API - generateToken] Error generating token:`, error.message);
        console.error(`[Auth API - generateToken] Error stack:`, error.stack);
        res.status(500).json({ error: 'Internal server error while generating token.' });
    }
};

module.exports = {
    generateToken
};
