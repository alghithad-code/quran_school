const express = require('express');
const rateLimit = require('express-rate-limit');
const { Reader } = require('../models');
const { SURAHS } = require('../data/quran');
const { getSurah, search, pages, JUZ_STARTS, available } = require('../lib/quranText');
const { presentReader } = require('../lib/readers');

// المصحف قسم عام للقراءة فقط: لا جلسة ولا مصادقة، ولا يصل لأي بيانات خاصة بالنظام.
const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'طلبات كثيرة، حاول بعد قليل' } }));

// بيانات التنقل (السور والأجزاء والصفحات إن توفرت) وقائمة القراء المفعّلين
router.get('/meta', async (req, res, next) => {
  try {
    if (!available()) return res.status(503).json({ error: 'نص القرآن غير متاح' });
    const readers = await Reader.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      surahs: SURAHS.map((s, i) => ({ n: i + 1, name: s.name, ayahs: s.ayahs })),
      juz: JUZ_STARTS,
      pages: pages(), // null إن لم يُضف ملف الصفحات
      readers: readers.map((r) => presentReader(r)),
      source: { name: 'مشروع تنزيل (Tanzil) — الرسم العثماني', url: 'https://tanzil.net' },
    });
  } catch (e) { next(e); }
});

// نص سورة كاملة (حرفياً من ملف تنزيل) — يتغير نادراً فيُخزَّن في المتصفح
router.get('/surah/:n', (req, res) => {
  if (!available()) return res.status(503).json({ error: 'نص القرآن غير متاح' });
  const s = getSurah(Number(req.params.n));
  if (!s) return res.status(404).json({ error: 'غير موجود' });
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(s);
});

router.get('/search', (req, res) => {
  if (!available()) return res.status(503).json({ error: 'نص القرآن غير متاح' });
  res.json(search(String(req.query.q || '').slice(0, 60)));
});

module.exports = router;
