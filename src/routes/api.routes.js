const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const configController = require('../controllers/config.controller');
const scoresController = require('../controllers/scores.controller');

const authMiddleware = require('../middleware/auth.middleware');

// Unprotected routes
router.post('/auth', authController.generateToken);

// Protected routes
router.use(authMiddleware);
router.post('/getEncryptionKey', configController.getClientEncryptionKey);
router.get('/system/pepper', configController.getSystemPepper);
router.post('/scores', scoresController.postScore);
router.get('/leaderboard', scoresController.getLeaderboard);

module.exports = router;
