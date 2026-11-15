/** GET /scorers?league=esp.1 -> top goleadores de la liga (ver services/scorersService.js) */
const express = require("express");
const router = express.Router();
const { getScorers } = require("../services/scorersService");
const { DEFAULT_LEAGUE } = require("../config/competitions");

router.get("/scorers", async (req, res, next) => {
  try {
    const league = String(req.query.league || DEFAULT_LEAGUE).replace(/[^a-z0-9._-]/gi, "");
    const r = await getScorers(league);
    res.json({ success: r.data.length > 0, league, count: r.data.length, data: r.data, source: r.source });
  } catch (err) { next(err); }
});

module.exports = router;
