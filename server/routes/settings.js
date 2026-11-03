const express = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getSettings, saveSettings } = require('../lib/settings');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const s = await getSettings();
    if (req.user.role !== 'admin') return res.json({ gradeScale: s.gradeScale, absenceThreshold: s.absenceThreshold, teachersCanAddStudents: s.teachersCanAddStudents });
    res.json(s);
  } catch (e) { next(e); }
});

const schema = z.object({
  gradeScale: z.array(z.object({
    key: z.string().regex(/^[a-z0-9_]{2,30}$/, 'مفتاح التقييم: حروف إنجليزية صغيرة وأرقام و _').optional(),
    label: z.string().trim().min(1, 'اسم التقييم مطلوب').max(40),
    score: z.coerce.number().min(0).max(100),
  })).min(2).max(10).optional(),
  auditRetentionDays: z.coerce.number().int().min(30, 'أقل مدة 30 يوماً').max(3650).optional(),
  absenceThreshold: z.coerce.number().int().min(1).max(30).optional(),
  backupKeep: z.coerce.number().int().min(1).max(52).optional(),
  teachersCanAddStudents: z.boolean().optional(),
});

router.patch('/', requireRole('admin'), async (req, res, next) => {
  try {
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const cur = await getSettings();
    const patch = { ...p.data };
    if (patch.gradeScale) {
      // المفاتيح الحالية لا تُحذف لأن سجلات قديمة تشير إليها؛ يمكن تعديل الاسم والدرجة وإضافة تقييمات جديدة
      const used = new Set();
      patch.gradeScale = patch.gradeScale.map((g, i) => {
        const key = g.key || `grade_${Date.now().toString(36)}_${i}`;
        used.add(key);
        return { key, label: g.label, score: g.score };
      });
      if (used.size !== patch.gradeScale.length) return res.status(400).json({ error: 'مفاتيح التقييم مكررة' });
      const missing = cur.gradeScale.filter((g) => !used.has(g.key));
      if (missing.length) return res.status(400).json({ error: 'لا يمكن حذف تقييم مستخدم سابقاً. عدّل اسمه فقط.' });
    }
    const next = await saveSettings(patch);
    await audit(req, 'settings.update', { targetType: 'settings', details: { before: cur, after: patch } });
    res.json(next);
  } catch (e) { next(e); }
});

module.exports = router;
