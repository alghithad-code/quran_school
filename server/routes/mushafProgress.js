const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const { Reader } = require('../models');
const { requireAnyAuth } = require('../middleware/auth');
const { SURAHS } = require('../data/quran');

// موضع قراءة المستخدم المسجل وإعداداته: مرتبط بحسابه فقط، ولا ينشئ سجلات طلاب ولا يدخل في سجل العمليات.
const router = express.Router();
router.use(requireAnyAuth);

const present = (m) => (m ? { surah: m.surah, ayah: m.ayah, readerId: m.readerId ? String(m.readerId) : null, fontSize: m.fontSize, speed: m.speed, hide: !!m.hide, updatedAt: m.updatedAt } : null);

router.get('/progress', (req, res) => res.json({ progress: present(req.user.mushaf) }));

const schema = z.object({
  surah: z.coerce.number().int().min(1).max(114),
  ayah: z.coerce.number().int().min(1),
  readerId: z.string().refine(mongoose.isValidObjectId).nullable().optional(),
  fontSize: z.coerce.number().min(16).max(56).optional(),
  speed: z.coerce.number().min(0.5).max(2).optional(),
  hide: z.boolean().optional(),
});

router.put('/progress', async (req, res, next) => {
  try {
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const d = p.data;
    if (d.ayah > SURAHS[d.surah - 1].ayahs) return res.status(400).json({ error: 'رقم الآية غير صحيح' });
    if (d.readerId && !(await Reader.exists({ _id: d.readerId }))) d.readerId = null;
    const mushaf = { surah: d.surah, ayah: d.ayah, readerId: d.readerId || null, fontSize: d.fontSize, speed: d.speed, hide: d.hide, updatedAt: new Date() };
    await User.updateOne({ _id: req.user._id }, { $set: { mushaf } }); // بحساب الجلسة فقط، لا بمعرّف من الطلب
    res.json({ progress: present(mushaf) });
  } catch (e) { next(e); }
});

module.exports = router;
