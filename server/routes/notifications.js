const express = require('express');
const mongoose = require('mongoose');
const { Notification } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
const mine = (req) => ({ userId: req.user._id }); // الإشعارات خاصة بصاحبها دائماً

router.get('/count', async (req, res, next) => {
  try { res.json({ unread: await Notification.countDocuments({ ...mine(req), read: false }) }); } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 30;
    const f = { ...mine(req), ...(req.query.unread === '1' ? { read: false } : {}) };
    const [items, total, unread] = await Promise.all([
      Notification.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(f),
      Notification.countDocuments({ ...mine(req), read: false }),
    ]);
    res.json({ items: items.map((n) => ({ id: n._id, type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, at: n.createdAt })), total, pages: Math.ceil(total / limit), unread });
  } catch (e) { next(e); }
});

router.post('/read-all', async (req, res, next) => {
  try { await Notification.updateMany({ ...mine(req), read: false }, { $set: { read: true } }); res.json({ ok: true }); } catch (e) { next(e); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    await Notification.updateOne({ _id: req.params.id, ...mine(req) }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
