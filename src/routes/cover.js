const express = require('express');
const router = express.Router();
const coverController = require('../controllers/coverController');

router.post('/', coverController.getCover);

module.exports = router;
