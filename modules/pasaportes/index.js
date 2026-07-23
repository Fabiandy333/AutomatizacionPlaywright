const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.json({
        modulo: "Pasaportes",
        estado: "OK"
    });
});

router.use(require("./routes/pasaportes.routes"));

module.exports = router;