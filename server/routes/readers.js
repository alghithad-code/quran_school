const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Reader } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateTemplate, presentReader } = require('../lib/readers');
const { audit } = require('../utils/audit');

// إدارة قراء المصحف: لمدير النظام فقط
const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const items = await Reader.find({}).sort({ order: 1, createdAt: 1 }).lean();
    res.json({ items: items.map((r) => presentReader(r, true)) });
  } catch (e) { next(e); }
});

const nameField = z.string().trim().min(2, 'اسم القارئ مطلوب').max(80);

router.post('/', async (req, res, next) => {
  try {
    const p = z.object({ name: nameField, urlTemplate: z.string() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const t = validateTemplate(p.data.urlTemplate);
    if (t.error) return res.status(400).json({ error: t.error });
    const last = await Reader.findOne({}).sort({ order: -1 }).select('order').lean();
    const r = await Reader.create({ name: p.data.name, urlTemplate: t.value, order: (last?.order || 0) + 1, createdBy: req.user._id });
    await audit(req, 'reader.create', { targetType: 'reader', target: r, details: { urlTemplate: r.urlTemplate } });
    res.status(201).json({ reader: presentReader(r, true) });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const r = await Reader.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    const p = z.object({ name: nameField.optional(), urlTemplate: z.string().optional(), enabled: z.boolean().optional(), order: z.coerce.number().int().min(0).max(1000).optional() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const before = { name: r.name, urlTemplate: r.urlTemplate, enabled: r.enabled, order: r.order };
    if (p.data.urlTemplate !== undefined) {
      const t = validateTemplate(p.data.urlTemplate);
      if (t.error) return res.status(400).json({ error: t.error });
      r.urlTemplate = t.value;
    }
    if (p.data.name !== undefined) r.name = p.data.name;
    if (p.data.enabled !== undefined) r.enabled = p.data.enabled;
    if (p.data.order !== undefined) r.order = p.data.order;
    await r.save();
    await audit(req, 'reader.update', { targetType: 'reader', target: r, details: { before, after: { name: r.name, urlTemplate: r.urlTemplate, enabled: r.enabled, order: r.order } } });
    res.json({ reader: presentReader(r, true) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const r = await Reader.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    await r.deleteOne();
    await audit(req, 'reader.delete', { targetType: 'reader', target: r, details: { urlTemplate: r.urlTemplate } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
