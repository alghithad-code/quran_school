const express = require('express');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { Enrollment, Level, LevelChange, Note, Transfer, PromotionRequest } = require('../models');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loadStudent, isManager, enrollmentScope } = require('../lib/access');
const { statsFor, pct } = require('../lib/stats');
const { buildEnrollmentFilter } = require('../lib/studentFilters');
const { resolvePeriod, weekday, addDays, todayStr } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);

const CAT = { hifz: 'الحفظ', review: 'المراجعة', behavior: 'السلوك', discipline: 'الانضباط', general: 'عامة' };
const LVL = { assign: 'تعيين', promotion: 'ترقية', demotion: 'خفض' };
const fmt = (v) => (v === null || v === undefined ? '—' : v);
const qty = (b) => [b.ayahs ? `${b.ayahs} آية` : '', b.pages ? `${b.pages} صفحة` : ''].filter(Boolean).join(' + ') || '0';
const lvlName = (e) => e.levelId?.name || 'بلا مستوى';

// كل تقرير يُرجع بنية موحدة {title, period, summary:[[عنوان، قيمة]], tables:[{title, columns, rows}]}
// ثم تُعرض في الواجهة وتُطبع وتُصدَّر إلى Excel من البنية نفسها. الحضور والتقييم محسوبان لكل تسجيل (مستوى) على حدة.
function gradeText(b, labels) {
  return Object.entries(b.grades).map(([k, n]) => `${labels[k] || k}: ${n}`).join('، ') || '—';
}

async function studentReport(s, enrollments, period) {
  const ids = enrollments.map((e) => e._id);
  const { stats, settings } = await statsFor(ids, period.from, period.to);
  const labels = Object.fromEntries(settings.gradeScale.map((g) => [g.key, g.label]));
  const range = { $gte: new Date(period.from + 'T00:00:00Z'), $lte: new Date(period.to + 'T23:59:59Z') };
  const [changes, notes] = await Promise.all([
    LevelChange.find({ enrollmentId: { $in: ids }, createdAt: range }).populate('fromLevelId toLevelId', 'name').lean(),
    Note.find({ enrollmentId: { $in: ids }, date: { $gte: period.from, $lte: period.to } }).sort({ date: 1 }).populate('createdBy', 'name').lean(),
  ]);
  const multi = enrollments.length > 1;
  const nameOf = Object.fromEntries(enrollments.map((e) => [String(e._id), lvlName(e)]));
  const summary = [];
  enrollments.forEach((e) => {
    const st = stats.get(String(e._id));
    const p = multi ? `${lvlName(e)} — ` : '';
    summary.push(
      [`${p}أيام الحضور`, st.present], [`${p}أيام الغياب`, st.absent], [`${p}نسبة الحضور`, `${st.rate}%`],
      [`${p}الحفظ الجديد`, qty(st.hifz)], [`${p}متوسط تقييم الحفظ`, fmt(st.hifz.avg)], [`${p}توزيع تقييمات الحفظ`, gradeText(st.hifz, labels)],
      [`${p}المراجعة`, qty(st.review)], [`${p}متوسط تقييم المراجعة`, fmt(st.review.avg)], [`${p}توزيع تقييمات المراجعة`, gradeText(st.review, labels)],
    );
  });
  summary.push(['ملاحظة', `متوسط التقييم محسوب من سلّم الدرجات (من 0 إلى ${Math.max(...settings.gradeScale.map((g) => g.score))})`]);
  return {
    title: `تقرير الطالب: ${s.name}`, period, summary,
    tables: [
      { title: 'تطور المستوى', columns: ['التاريخ', 'المستوى', 'النوع', 'من', 'إلى', 'السبب'], rows: changes.map((c) => [c.createdAt.toISOString().slice(0, 10), nameOf[String(c.enrollmentId)] || '—', LVL[c.type], fmt(c.fromLevelId?.name), c.toLevelId?.name, c.reason || '—']) },
      { title: 'الملاحظات المهمة', columns: ['التاريخ', 'المستوى', 'التصنيف', 'الملاحظة', 'الكاتب'], rows: notes.map((n) => [n.date, nameOf[String(n.enrollmentId)] || '—', CAT[n.category], n.text, n.createdBy?.name || '—']) },
    ],
  };
}

// نسبة تسجيل الحضور في مواعيد الجدول = سجلات الحضور في أيام الجدول ÷ عدد مرات الموعد حتى اليوم
function commitmentRate(enrollments, attRows, period) {
  const end = period.to < todayStr() ? period.to : todayStr();
  const sched = new Map(enrollments.map((e) => [String(e._id), new Set(e.schedule?.days || [])]));
  let expected = 0, recorded = 0;
  for (let d = period.from; d <= end; d = addDays(d, 1)) {
    const wd = weekday(d);
    sched.forEach((days) => { if (days.has(wd)) expected += 1; });
  }
  attRows.forEach((a) => { if (sched.get(String(a.enrollmentId))?.has(weekday(a.date))) recorded += 1; });
  return expected ? pct(Math.min(recorded, expected), expected) : null;
}

// enrollments: lean مع studentId{name} و levelId{name}
async function groupReport(enrollments, period) {
  const ids = enrollments.map((e) => e._id);
  const { stats, attRows } = await statsFor(ids, period.from, period.to);
  const agg = (fn) => ids.reduce((a, id) => a + fn(stats.get(String(id))), 0);
  const present = agg((s) => s.present), absent = agg((s) => s.absent);
  const mean = (t) => { const all = ids.flatMap((id) => stats.get(String(id))[t].scores); return all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 100) / 100 : null; };
  const rows = enrollments.map((e) => { const x = stats.get(String(e._id)); return [`${e.studentId?.name || '—'}${e.levelId ? ` (${e.levelId.name})` : ''}`, x.present, x.absent, `${x.rate}%`, qty(x.hifz), fmt(x.hifz.avg), qty(x.review), fmt(x.review.avg)]; });
  return {
    stats, present, absent, hifzAvg: mean('hifz'), reviewAvg: mean('review'),
    commit: commitmentRate(enrollments, attRows, period),
    table: { title: 'أداء الطلاب (لكل مستوى)', columns: ['الطالب (المستوى)', 'حضور', 'غياب', 'نسبة الحضور', 'الحفظ', 'متوسط الحفظ', 'المراجعة', 'متوسط المراجعة'], rows },
  };
}
const popE = (q) => q.populate('studentId', 'name status').populate('levelId', 'name').populate('teacherId', 'name');
const distinct = (enrs) => new Set(enrs.map((e) => String(e.studentId?._id || e.studentId))).size;

router.get('/student/:id', async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const period = resolvePeriod(req.query);
    const enrollments = await popE(Enrollment.find({ studentId: s._id, ...enrollmentScope(req.user) }).sort({ createdAt: 1 })).lean();
    send(req, res, await studentReport(s, enrollments, period));
  } catch (err) { next(err); }
});

router.get('/teacher/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || (!isManager(req.user) && String(req.user._id) !== req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const t = await User.findOne({ _id: req.params.id, role: 'teacher' });
    if (!t) return res.status(404).json({ error: 'غير موجود' });
    const period = resolvePeriod(req.query);
    const all = await popE(Enrollment.find({ teacherId: t._id, status: 'active' })).lean();
    const enrs = all.filter((e) => e.studentId?.status === 'active').sort((a, b) => (a.studentId.name > b.studentId.name ? 1 : -1));
    const g = await groupReport(enrs, period);
    send(req, res, {
      title: `تقرير المعلم: ${t.name}`, period,
      summary: [['عدد الطلاب', distinct(enrs)], ['عدد التسجيلات (المستويات)', enrs.length], ['إجمالي الحضور', g.present], ['إجمالي الغياب', g.absent], ['نسبة الحضور', `${pct(g.present, g.present + g.absent)}%`], ['متوسط تقييم الحفظ', fmt(g.hifzAvg)], ['متوسط تقييم المراجعة', fmt(g.reviewAvg)], ['نسبة تسجيل الحضور في مواعيد الجدول', g.commit === null ? '—' : `${g.commit}%`]],
      tables: [g.table],
    });
  } catch (err) { next(err); }
});

router.get('/school', requireRole('admin', 'supervisor'), async (req, res, next) => {
  try {
    const period = resolvePeriod(req.query);
    const ef = await buildEnrollmentFilter(req.user, { teacherId: req.query.teacherId, levelId: req.query.levelId });
    const all = await popE(Enrollment.find(ef)).lean();
    const enrs = all.filter((e) => e.studentId?.status === 'active').sort((a, b) => (a.studentId.name > b.studentId.name ? 1 : -1));
    const g = await groupReport(enrs, period);
    const [teachers, levels] = await Promise.all([User.countDocuments({ role: 'teacher', status: 'active' }), Level.find().sort({ order: 1 }).lean()]);
    const range = { $gte: new Date(period.from + 'T00:00:00Z'), $lte: new Date(period.to + 'T23:59:59Z') };
    const [transfers, promos] = await Promise.all([Transfer.countDocuments({ createdAt: range }), PromotionRequest.find({ createdAt: range }).select('status').lean()]);
    const byLevel = levels.map((l) => [l.name, enrs.filter((e) => String(e.levelId?._id) === String(l._id)).length]);
    const noLevel = enrs.filter((e) => !e.levelId).length;
    if (noLevel) byLevel.push(['بلا مستوى', noLevel]);
    const tmap = new Map();
    enrs.forEach((e) => { const k = e.teacherId?.name || '—'; (tmap.get(k) || tmap.set(k, []).get(k)).push(e); });
    const byTeacher = [...tmap.entries()].map(([name, list]) => {
      const sum = (f) => list.reduce((a, e) => a + f(g.stats.get(String(e._id))), 0);
      const p = sum((x) => x.present), a = sum((x) => x.absent);
      return [name, distinct(list), `${pct(p, p + a)}%`];
    });
    send(req, res, {
      title: 'تقرير المجتمع', period,
      summary: [['إجمالي الطلاب', distinct(enrs)], ['إجمالي التسجيلات (المستويات)', enrs.length], ['إجمالي المعلمين النشطين', teachers], ['الحضور', g.present], ['الغياب', g.absent], ['نسبة الحضور', `${pct(g.present, g.present + g.absent)}%`], ['متوسط تقييم الحفظ', fmt(g.hifzAvg)], ['متوسط تقييم المراجعة', fmt(g.reviewAvg)], ['عمليات النقل في الفترة', transfers], ['طلبات الترقية في الفترة', `${promos.length} (معلّق ${promos.filter((p) => p.status === 'pending').length}، موافق ${promos.filter((p) => p.status === 'approved').length}، مرفوض ${promos.filter((p) => p.status === 'rejected').length})`]],
      tables: [
        { title: 'توزيع التسجيلات على المستويات', columns: ['المستوى', 'عدد الطلاب'], rows: byLevel },
        { title: 'توزيع الطلاب على المعلمين', columns: ['المعلم', 'عدد الطلاب', 'نسبة الحضور'], rows: byTeacher },
        g.table,
      ],
    });
  } catch (err) { next(err); }
});

// ?format=xlsx يعيد ملف Excel بالاتجاه من اليمين لليسار، وإلا JSON
async function send(req, res, report) {
  try {
    await sendInner(req, res, report);
  } catch (err) {
    console.error('report export failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'تعذّر إنشاء التقرير' });
  }
}
async function sendInner(req, res, report) {
  if (req.query.format !== 'xlsx') return res.json(report);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('التقرير', { views: [{ rightToLeft: true }] });
  ws.addRow([report.title]).font = { bold: true, size: 14 };
  ws.addRow([`الفترة: ${report.period.from} إلى ${report.period.to}`]);
  ws.addRow([]);
  report.summary.forEach((r) => { const row = ws.addRow(r); row.getCell(1).font = { bold: true }; });
  report.tables.forEach((t) => {
    ws.addRow([]);
    ws.addRow([t.title]).font = { bold: true };
    const h = ws.addRow(t.columns); h.font = { bold: true };
    t.rows.forEach((r) => ws.addRow(r));
  });
  ws.columns.forEach((c) => { c.width = 24; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="report-${report.period.from}_${report.period.to}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = router;
