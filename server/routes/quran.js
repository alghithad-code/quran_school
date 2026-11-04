const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getSurah, verse, available } = require('../lib/quranText');
const { SURAHS } = require('../data/quran');
const DAILY = require('../data/dailyVerses');
const { todayStr } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);

// آية اليوم: تدور القائمة بحسب تاريخ اليوم بتوقيت الرياض، فيرى الجميع الآية نفسها
router.get('/daily', (req, res) => {
  if (!available()) return res.status(503).json({ error: 'نص القرآن غير متاح' });
  const day = Math.floor(Date.parse(todayStr() + 'T00:00:00Z') / 86400000);
  const [surah, ayah] = DAILY[day % DAILY.length];
  res.json({ surah, ayah, name: SURAHS[surah - 1].name, text: verse(surah, ayah) });
});

// نص سورة كاملة (حرفياً من ملف تنزيل). المتصفح يخزّنه مؤقتاً لأنه لا يتغير.
router.get('/:surah', (req, res) => {
  if (!available()) return res.status(503).json({ error: 'نص القرآن غير متاح' });
  const s = getSurah(Number(req.params.surah));
  if (!s) return res.status(404).json({ error: 'غير موجود' });
  res.set('Cache-Control', 'private, max-age=86400');
  res.json(s);
});

module.exports = router;
