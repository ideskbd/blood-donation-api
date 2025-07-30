const express = require('express');
const router = express.Router();

// This route can be used for Telegram webhook (if needed)
router.post('/telegram/webhook', (req, res) => {
  // You can process Telegram updates here if using webhook mode
  res.status(200).send('OK');
});

module.exports = router;
