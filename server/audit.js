const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isDateStr } = require('../utils/dates');

const router = express.Router();
// للقراءة فقط. لا توجد أي مسارات تعديل أو حذف لسجل العمليات.
router.use(requireAuth, requireRole('admin', 'supervisor'));

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 40;
    const f = {};
    if (req.query.action) f.action = new RegExp('^' + String(req.query.action).replace(/[^a-z_.]/gi, ''));
    if (mongoose.isValidObjectId(req.query.actorId)) f.actorId = req.query.actorId;
    if (isDateStr(req.query.from) || isDateStr(req.query.to)) {
      f.createdAt = {};
      if (isDateStr(req.query.from)) f.createdAt.$gte = new Date(req.query.from + 'T00:00:00Z');
      if (isDateStr(req.query.to)) f.createdAt.$lte = new Date(req.query.to + 'T23:59:59Z');
    }
    const [items, total] = await Promise.all([
      AuditLog.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(f),
    ]);
    res.json({ items: items.map((a) => ({ id: a._id, at: a.createdAt, actor: a.actorName || 'النظام', action: a.action, target: a.targetLabel, targetType: a.targetType, targetId: a.targetId, details: a.details })), total, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

module.exports = router;
