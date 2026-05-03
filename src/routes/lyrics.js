const express = require('express');
const router = express.Router();
const lyricsController = require('../controllers/lyricsController');

router.post('/', lyricsController.getLyrics);

module.exports = router;
