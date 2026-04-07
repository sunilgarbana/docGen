const express = require('express');
const router = express.Router();

// Base route placeholder
router.get('/', (req, res) => {
  res.json({ message: 'Docs route' });
});

module.exports = router;
