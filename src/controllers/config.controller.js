const { getSheetData } = require('../services/googleSheets.service');
const { getEncryptedAesKey } = require('../services/encryption.service');

const getSystemPepper = async (req, res) => {
    try {
        const { version } = req.query;

        if (!version) {
            return res.status(400).json({ error: 'Missing required query parameter: version' });
        }

        // Expects a sheet named 'Config' with Version in column A and Pepper in column B
        // Example: Config!A:B
        const data = await getSheetData('Config!A:B');

        if (!data || data.length === 0) {
            return res.status(500).json({ error: 'Failed to retrieve configuration from database.' });
        }

        let foundPepper = null;

        // Skip header if it's the first row. Handled automatically during search.
        for (let i = 1; i < data.length; i++) {
            if (data[i] && data[i][0] === version) {
                foundPepper = data[i][1];
                break;
            }
        }

        if (!foundPepper) {
            return res.status(404).json({ error: `Version '${version}' not found in configuration.` });
        }

        res.status(200).json({
            version: version,
            pepper: foundPepper
        });
    } catch (error) {
        console.error('Error fetching system pepper:', error);

        // Distinguish between actual data missing vs GSheet API error
        if (error.message && error.message.includes('GOOGLE_SHEET_ID is not set')) {
            return res.status(500).json({ error: 'Server configuration error: Google auth not setups properly' });
        }

        res.status(500).json({ error: 'Internal server error while fetching configuration' });
    }
};

const getClientEncryptionKey = async (req, res) => {
    try {
        const { publicKey } = req.body;

        if (!publicKey || typeof publicKey !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid publicKey in request body.' });
        }

        const encryptedAesKey = getEncryptedAesKey(publicKey);
        res.status(200).json({ encryptedAesKey });
    } catch (error) {
        console.error('Error serving encryption key:', error);
        res.status(400).json({ error: error.message || 'Failed to generate encrypted AES key.' });
    }
};

module.exports = {
    getSystemPepper,
    getClientEncryptionKey
};
