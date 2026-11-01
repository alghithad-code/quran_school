const express = require('express');
const mongoose = require('mongoose');
const { Backup } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createBackup, restore, importUploaded, bucket } = require('../lib/backup');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth, requireRole('admin')); // مدير النظام فقط

const present = (b) => ({ id: b._id, kind: b.kind, status: b.status, filename: b.filename, size: b.size, counts: b.counts, error: b.error, at: b.createdAt });

router.get('/', async (req, res, next) => {
  try { res.json({ items: (await Backup.find().sort({ createdAt: -1 }).limit(50).lean()).map(present) }); } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = await createBackup('manual', req.user._id);
    await audit(req, 'backup.create', { targetType: 'backup', details: { status: b.status, filename: b.filename } });
    if (b.status !== 'success') return res.status(500).json({ error: b.error });
    res.status(201).json({ backup: present(b) });
  } catch (e) { next(e); }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const b = await Backup.findById(req.params.id);
    if (!b || b.status !== 'success') return res.status(404).json({ error: 'غير موجود' });
    await audit(req, 'backup.download', { targetType: 'backup', details: { filename: b.filename } });
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${b.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    bucket().openDownloadStream(b.fileId).on('error', next).pipe(res);
  } catch (e) { next(e); }
});

// رفع نسخة محفوظة خارج الاستضافة (ملف .json.gz كما نُزّل)
router.post('/upload', express.raw({ type: 'application/octet-stream', limit: '60mb' }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'لم يُرسل ملف' });
    let b;
    try { b = await importUploaded(req.body, req.user._id); } catch (e) { return res.status(400).json({ error: e.message }); }
    await audit(req, 'backup.upload', { targetType: 'backup', details: { filename: b.filename } });
    res.status(201).json({ backup: present(b) });
  } catch (e) { next(e); }
});

// استعادة: تتطلب كتابة كلمة التأكيد صراحةً. تُنشأ نسخة أمان تلقائياً، ويُتراجع تلقائياً عند الفشل.
router.post('/:id/restore', async (req, res, next) => {
  try {
    if (req.body?.confirm !== 'استعادة') return res.status(400).json({ error: 'اكتب كلمة «استعادة» للتأكيد' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const b = await Backup.findById(req.params.id);
    if (!b || b.status !== 'success') return res.status(404).json({ error: 'غير موجود' });
    let result;
    try { result = await restore(b, req.user._id); } catch (e) { return res.status(500).json({ error: e.message }); }
    // بعد الاستعادة قد يختلف حساب المستخدم الحالي، فتُنهى الجلسة ليعيد الدخول
    req.session.destroy(() => {
      res.clearCookie('sid');
      res.json({ ok: true, ...result });
    });
  } catch (e) { next(e); }
});

module.exports = router;
