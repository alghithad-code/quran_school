const express = require('express');
const mongoose = require('mongoose');
const { Level, PromotionRequest, Student, LevelChange } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loadStudent, isManager } = require('../lib/access');
const { statsFor } = require('../lib/stats');
const { notify, managerIds } = require('../lib/notify');
const { audit } = require('../utils/audit');
const { todayStr, addDays } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);
const manager = requireRole('admin', 'supervisor');

function present(r) {
  return {
    id: String(r._id), status: r.status, note: r.note, snapshot: r.snapshot, decisionNote: r.decisionNote,
    createdAt: r.createdAt, decidedAt: r.decidedAt,
    student: r.studentId?.name ? { id: String(r.studentId._id), name: r.studentId.name } : null,
    teacher: r.teacherId?.name, from: r.fromLevelId?.name, to: r.toLevelId?.name, decidedBy: r.decidedBy?.name,
  };
}
const populate = (q) => q.populate('studentId', 'name').populate('teacherId decidedBy', 'name').populate('fromLevelId toLevelId', 'name');

router.get('/', async (req, res, next) => {
  try {
    const f = {};
    if (!isManager(req.user)) f.teacherId = req.user._id; // المعلم يرى طلباته فقط
    if (['pending', 'approved', 'rejected'].includes(req.query.status)) f.status = req.query.status;
    const items = await populate(PromotionRequest.find(f).sort({ createdAt: -1 }).limit(100)).lean();
    res.json({ items: items.map(present) });
  } catch (err) { next(err); }
});

// المعلم يرفع طلب ترقية لطالبه: المستوى المطلوب هو التالي في الترتيب
router.post('/', requireRole('teacher'), async (req, res, next) => {
  try {
    const s = await loadStudent(req, res, req.body?.studentId);
    if (!s) return;
    if (s.status !== 'active') return res.status(400).json({ error: 'الطالب غير نشط' });
    if (!s.levelId) return res.status(400).json({ error: 'الطالب غير مرتبط بمستوى' });
    if (await PromotionRequest.exists({ studentId: s._id, status: 'pending' })) return res.status(409).json({ error: 'يوجد طلب ترقية معلّق لهذا الطالب' });
    const cur = await Level.findById(s.levelId);
    const next_ = await Level.findOne({ order: { $gt: cur.order } }).sort({ order: 1 });
    if (!next_) return res.status(400).json({ error: 'لا يوجد مستوى أعلى من مستوى الطالب' });

    const to = todayStr(), from = addDays(to, -29);
    const { stats } = await statsFor([s._id], from, to);
    const st = stats.get(String(s._id));
    const snapshot = {
      from, to, present: st.present, absent: st.absent, rate: st.rate,
      hifz: { count: st.hifz.count, avg: st.hifz.avg, ayahs: st.hifz.ayahs, pages: st.hifz.pages },
      review: { count: st.review.count, avg: st.review.avg, ayahs: st.review.ayahs, pages: st.review.pages },
    };
    const r = await PromotionRequest.create({ studentId: s._id, teacherId: req.user._id, fromLevelId: cur._id, toLevelId: next_._id, note: String(req.body.note || '').trim().slice(0, 1000), snapshot });
    await audit(req, 'promotion.request', { targetType: 'student', target: s, details: { from: cur.name, to: next_.name } });
    await notify(await managerIds(), { type: 'promotion.request', title: 'طلب ترقية جديد', body: `${s.name}: من ${cur.name} إلى ${next_.name}`, link: '/promotions' });
    res.status(201).json({ request: present(await populate(PromotionRequest.findById(r._id)).lean()) });
  } catch (err) { next(err); }
});

router.post('/:id/decision', manager, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const r = await PromotionRequest.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    if (r.status !== 'pending') return res.status(400).json({ error: 'تمت معالجة هذا الطلب مسبقاً' });
    const approve = req.body?.approve === true;
    const note = String(req.body?.note || '').trim().slice(0, 500);
    const s = await Student.findById(r.studentId);
    if (!s) return res.status(404).json({ error: 'الطالب غير موجود' });

    if (approve) {
      if (String(s.levelId) !== String(r.fromLevelId)) return res.status(409).json({ error: 'تغيّر مستوى الطالب منذ رفع الطلب. ارفض الطلب وأنشئ آخر.' });
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          s.levelId = r.toLevelId;
          await s.save({ session });
          await LevelChange.create([{ studentId: s._id, fromLevelId: r.fromLevelId, toLevelId: r.toLevelId, type: 'promotion', reason: note, byId: req.user._id, requestId: r._id }], { session });
          r.status = 'approved'; r.decisionNote = note; r.decidedBy = req.user._id; r.decidedAt = new Date();
          await r.save({ session });
        });
      } finally { await session.endSession(); }
    } else {
      r.status = 'rejected'; r.decisionNote = note; r.decidedBy = req.user._id; r.decidedAt = new Date();
      await r.save();
    }
    await audit(req, approve ? 'promotion.approve' : 'promotion.reject', { targetType: 'student', target: s, details: { note } });
    await notify([r.teacherId], { type: 'promotion.decision', title: approve ? 'تمت الموافقة على الترقية' : 'تم رفض طلب الترقية', body: `${s.name}${note ? ': ' + note : ''}`, link: `/students/${s._id}` });
    res.json({ request: present(await populate(PromotionRequest.findById(r._id)).lean()) });
  } catch (err) { next(err); }
});

module.exports = router;
