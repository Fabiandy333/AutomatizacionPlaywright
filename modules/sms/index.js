const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    modulo: 'SMS Internacional',
    estado: 'OK',
  });
});

router.use(
  require('./routes/sms.routes')
);

module.exports = router;