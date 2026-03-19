const express = require('express');
const router = express.Router();
const { AccessToken } = require('livekit-server-sdk');
const auth = require('../middleware/auth');

// @route   GET api/livekit/token
// @desc    Get LiveKit access token
// @access  Private
router.get('/token', auth, async (req, res) => {
    try {
        const { roomName, identity } = req.query;

        if (!roomName || !identity) {
            return res.status(400).json({ message: 'Room name and identity are required' });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const host = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !host) {
            return res.status(500).json({ message: 'LiveKit configuration is missing on server' });
        }

        const identityStr = String(identity);
        const roomNameStr = String(roomName);

        const at = new AccessToken(apiKey, apiSecret, {
            identity: identityStr,
            name: identityStr,
        });

        at.addGrant({
            roomJoin: true,
            room: roomNameStr,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const token = await at.toJwt();
        console.log(`[LiveKit] Generated token for ${identityStr} in ${roomNameStr}. Token length: ${token.length}`);

        res.json({ token, serverUrl: host });
    } catch (err) {
        console.error('LiveKit token error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;
