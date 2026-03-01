const { decodeAndVerifyScore, nameUUIDFromBytes } = require('../utils/crypto.util');
const { SEED_SEPARATOR, MAX_SCORE_PER_MINUTE } = require('../config/constants');
const { getSheetData, appendSheetData, updateSheetData } = require('../services/googleSheets.service');

const postScore = async (req, res) => {
    try {
        const { gameScore } = req.body;
        if (!gameScore) {
            return res.status(400).json({ error: 'Missing gameScore in request body.' });
        }

        // 1. Decode and Verify Signature
        let decodedPayload;
        try {
            decodedPayload = decodeAndVerifyScore(gameScore);
        } catch (error) {
            return res.status(400).json({ error: error.message || 'Signature verification failed.' });
        }

        const { highScores, sessionHistory, metadata } = decodedPayload;

        if (!sessionHistory || !Array.isArray(sessionHistory)) {
            return res.status(400).json({ error: 'Invalid payload structure: missing sessionHistory.' });
        }

        // 2. Rigorous validations on sessionHistory
        for (let session of sessionHistory) {
            let { mode, score, timePlayed, playerUsername, sessionId, timestamp } = session;

            // Handle negative score
            if (score < 0) {
                score = 0;
                session.score = 0; // mutate to fix it
            }

            // UUID Verification
            // (username + SEED_SEPARATOR + mode + SEED_SEPARATOR + score + SEED_SEPARATOR + timePlayed + SEED_SEPARATOR + timestamp)
            const seedString = `${playerUsername}${SEED_SEPARATOR}${mode}${SEED_SEPARATOR}${score}${SEED_SEPARATOR}${timePlayed}${SEED_SEPARATOR}${timestamp}`;
            const expectedUUID = nameUUIDFromBytes(seedString);

            if (expectedUUID !== sessionId) {
                return res.status(403).json({ error: `Session UUID mismatch indicates tampering for mode ${mode}.` });
            }

            // Physical possibility check
            const maxAllowed = Math.floor((timePlayed / 60) * (MAX_SCORE_PER_MINUTE[mode] || 0));
            if (score > maxAllowed) {
                return res.status(403).json({ error: `Impossible score/time ratio detected for mode ${mode}.` });
            }
        }

        // Handle negative scores in highScores
        if (highScores) {
            for (const mode of Object.keys(highScores)) {
                if (highScores[mode].score < 0) {
                    highScores[mode].score = 0;
                }
            }
        }

        // 3. Update GlobalScores to maintain only the highest score per mode (Upsert)
        if (highScores) {
            let existingScoresData = [];
            try {
                existingScoresData = await getSheetData('GlobalScores!A:F') || [];
            } catch (e) {
                console.log('GlobalScores sheet not found or empty, skipping reading existing data.');
            }

            for (const mode of Object.keys(highScores)) {
                const hs = highScores[mode];
                let modeRowIndex = -1;
                let currentRecord = -1;

                // Find existing row for this mode (skipping header at row 1)
                for (let i = 1; i < existingScoresData.length; i++) {
                    if (existingScoresData[i] && existingScoresData[i][0] === mode) {
                        modeRowIndex = i + 1; // 1-based index for API
                        currentRecord = parseInt(existingScoresData[i][1], 10);
                        if (isNaN(currentRecord)) currentRecord = 0;
                        if (currentRecord < 0) currentRecord = 0;
                        break;
                    }
                }

                // Only replace/add if strictly higher or if it's the first score for this mode
                if (hs.score > currentRecord || currentRecord === -1) {
                    const newRow = [
                        mode,
                        hs.score,
                        hs.scoredBy,
                        hs.timestamp,
                        hs.sessionId,
                        hs.highScoreId
                    ];

                    if (modeRowIndex !== -1) {
                        await updateSheetData(`GlobalScores!A${modeRowIndex}:F${modeRowIndex}`, [newRow]);
                    } else {
                        await appendSheetData('GlobalScores!A:F', [newRow]);
                    }
                }
            }
        }

        // 4. Update PlayerMasterData (Upsert based on systemUUID)
        if (metadata && metadata.systemUUID) {
            const systemUUID = metadata.systemUUID;
            let pmData = [];
            try {
                pmData = await getSheetData('PlayerMasterData!A:A') || [];
            } catch (e) {
                console.log('PlayerMasterData sheet not found or empty, skipping reading existing data.');
            }

            let pmRowIndex = -1;
            // Skip header at index 0
            for (let i = 1; i < pmData.length; i++) {
                if (pmData[i] && pmData[i][0] === systemUUID) {
                    pmRowIndex = i + 1; // 1-based index for sheets
                    break;
                }
            }

            const pmRow = [
                systemUUID,
                metadata.playerOS || '',
                metadata.totalTimePlayed || 0,
                metadata.timestamp || '',
                highScores?.TIME_BOUND?.score || 0,
                highScores?.TIME_BOUND?.scoredBy || '',
                highScores?.TIME_BOUND?.sessionId || '',
                highScores?.ENDLESS?.score || 0,
                highScores?.ENDLESS?.scoredBy || '',
                highScores?.ENDLESS?.sessionId || '',
                highScores?.CLASSIC?.score || 0,
                highScores?.CLASSIC?.scoredBy || '',
                highScores?.CLASSIC?.sessionId || ''
            ];

            if (pmRowIndex !== -1) {
                await updateSheetData(`PlayerMasterData!A${pmRowIndex}:M${pmRowIndex}`, [pmRow]);
            } else {
                await appendSheetData('PlayerMasterData!A:M', [pmRow]);
            }
        }

        // 5. Append unique sessions to sessionData
        let sdData = [];
        try {
            sdData = await getSheetData('sessionData!A:A') || [];
        } catch (e) {
            console.log('sessionData sheet not found or empty, skipping reading existing data.');
        }

        const existingSessionIds = new Set();
        // Skip header at index 0
        for (let i = 1; i < sdData.length; i++) {
            if (sdData[i] && sdData[i][0]) {
                existingSessionIds.add(sdData[i][0]);
            }
        }

        const sessionRowsToAppend = [];
        for (let session of sessionHistory) {
            if (!existingSessionIds.has(session.sessionId)) {
                sessionRowsToAppend.push([
                    session.sessionId || '',
                    session.playerUsername || '',
                    session.mode || '',
                    session.score || 0,
                    session.timePlayed || 0,
                    session.timestamp || 0,
                    metadata?.systemUUID || ''
                ]);
                existingSessionIds.add(session.sessionId); // avoid duplicates in same payload
            }
        }

        if (sessionRowsToAppend.length > 0) {
            await appendSheetData('sessionData!A:G', sessionRowsToAppend);
        }

        return res.status(201).json({ message: 'All scores successfully verified and updated.' });

    } catch (error) {
        console.error('Error posting score:', error);

        // Return 500 error if missing auth setup
        if (error.message && error.message.includes('GOOGLE_SHEET_ID is not set')) {
            return res.status(500).json({ error: 'Server configuration error: Google auth not setups properly' });
        }

        res.status(500).json({ error: 'Internal server error while processing score.' });
    }
};

const getLeaderboard = async (req, res) => {
    try {
        const data = await getSheetData('GlobalScores!A:F');

        // Mode -> { username, highestScore }
        const leaderboard = {
            TIME_BOUND: { username: "N/A", highestScore: -1 },
            ENDLESS: { username: "N/A", highestScore: -1 },
            CLASSIC: { username: "N/A", highestScore: -1 }
        };

        if (data && data.length > 1) { // Changed to > 1 to ensure data past headers exists
            for (let i = 1; i < data.length; i++) { // Skip header row with i = 1
                const row = data[i];
                if (!row || row.length < 3) continue;

                const mode = row[0];
                let score = parseInt(row[1], 10);
                const username = row[2];

                if (isNaN(score)) continue; // Likely header row

                // Negative score correction
                if (score < 0) {
                    score = 0;
                }

                if (leaderboard[mode] && score > leaderboard[mode].highestScore) {
                    leaderboard[mode] = { username, highestScore: score };
                }
            }
        }

        // Formatting negative init to 0 if no data
        for (const mode in leaderboard) {
            if (leaderboard[mode].highestScore === -1) {
                leaderboard[mode].highestScore = 0;
            }
        }

        return res.status(200).json(leaderboard);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        if (error.message && error.message.includes('GOOGLE_SHEET_ID is not set')) {
            return res.status(500).json({ error: 'Server configuration error: Google auth not setups properly' });
        }
        res.status(500).json({ error: 'Internal server error while fetching leaderboard.' });
    }
};

module.exports = {
    postScore,
    getLeaderboard
};
