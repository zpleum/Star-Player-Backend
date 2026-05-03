const express = require('express');
const router = express.Router();
const youtubeController = require('../controllers/youtubeController');

router.get('/info', youtubeController.getInfo);
router.post('/download', youtubeController.downloadAudio);
router.get('/progress', youtubeController.getProgress);

module.exports = router;
