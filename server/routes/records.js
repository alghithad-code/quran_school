const express = require('express');
const mongoose = require('mongoose');
const { Attendance, Recitation, Note } = require('../models');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { loadStudent, isManager, canEditRecord } = require('../lib/access');
const { getSettings } = require('../lib/settings');
const { notify, managerIds } = require('../lib/notify');
const { audit } = require('../utils/audit');
const { todayStr, addDays, isDateStr } = require('../utils/dates');
const { SURAHS, PAGES } = require('../data/quran');

const studentRecords = express.Router({ mergeParams: true });
const recordEdit = express.Router();
studentRecords.use(requireAuth);
recordEdit.use(requireAuth);

const MODELS = { attendance: Attendance, recitation: Recitation, note: Note };
const CATS = ['hifz', 'review', 'behavior', 'discipline', 'general'];
const int = (v) => (Number.isInteger(Number(v)) && v !== '' && v !== null ? Number(v) : NaN);

// التاريخ: ليس في المستقبل. المعلم يسجل لليوم أو حتى 7 أيام سابقة؛ المشرف ومدير النظام بلا حد سابق.
function checkDate(user, date) {
  if (!isDateStr(date)) return 'التاريخ غير صحيح';
  const today = todayStr();
  if (date > today) return 'لا يمكن التسجيل بتاريخ مستقبلي';
  if (!isManager(user) && date < addDays(today, -7)) return 'لا يمكن للمعلم التسجيل لأكثر من 7 أيام سابقة';
  return null;
}

function cleanRecitation(b, gradeKeys) {
  const out = { type: b.type, mode: b.mode };
  if (!['hifz', 'review'].includes(out.type)) return { error: 'نوع التسميع غير صحيح' };
  if (b.grade) {
    if (!gradeKeys.includes(b.grade)) return { error: 'التقييم غير صحيح' };
    out.grade = b.grade;
  } else out.grade = null;
  if (out.mode === 'surah') {
    const surah = int(b.surah), from = int(b.fromAyah), to = int(b.toAyah);
    const s = SURAHS[surah - 1];
    if (!s) return { error: 'اختر السورة' };
    if (!(from >= 1) || !(to >= from) || to > s.ayahs) return { error: `الآيات يجب أن تكون بين 1 و${s.ayahs} (من ≤ إلى)` };
    Object.assign(out, { surah, fromAyah: from, toAyah: to, fromPage: undefined, toPage: undefined });
  } else if (out.mode === 'page') {
    const from = int(b.fromPage), to = int(b.toPage);
    if (!(from >= 1) || !(to >= from) || to > PAGES) return { error: `الصفحات يجب أن تكون بين 1 و${PAGES} (من ≤ إلى)` };
    Object.assign(out, { fromPage: from, toPage: to, surah: undefined, fromAyah: undefined, toAyah: undefined });
  } else return { error: 'اختر طريقة الإدخال' };
  return { value: out };
}

function present(kind, r, user) {
  const base = { kind, id: String(r._id), date: r.date, at: r.createdAt, by: r.createdBy?.name ? { id: String(r.createdBy._id), name: r.createdBy.name } : null, editable: canEditRecord(user, { createdBy: r.createdBy?._id || r.createdBy }) };
  if (kind === 'attendance') return { ...base, status: r.status, note: r.note };
  if (kind === 'note') return { ...base, category: r.category, text: r.text };
  return { ...base, type: r.type, mode: r.mode, surah: r.surah, surahName: r.surah ? SURAHS[r.surah - 1]?.name : undefined, fromAyah: r.fromAyah, toAyah: r.toAyah, fromPage: r.fromPage, toPage: r.toPage, grade: r.grade };
}

// ---------- القراءة: افتراضياً آخر 7 أيام ----------
studentRecords.get('/records', async (req, res, next) => {
  try {
    const s = await loadStudent(req, res);
    if (!s) return;
    const today = todayStr();
    const from = isDateStr(req.query.from) ? req.query.from : addDays(today, -6);
    const to = isDateStr(req.query.to) ? req.query.to : today;
    const t = req.query.type;
    const q = { studentId: s._id, date: { $gte: from, $lte: to } };
    const want = (k) => !t || t === 'all' || t === k;
    const [att, hz, note] = await Promise.all([
      want('attendance') ? Attendance.find(q).populate('createdBy', 'name').limit(500).lean() : [],
      t === 'hifz' || t === 'review' || !t || t === 'all' ? Recitation.find({ ...q, ...(t === 'hifz' || t === 'review' ? { type: t } : {}) }).populate('createdBy', 'name').limit(500).lean() : [],
      want('note') ? Note.find(q).populate('createdBy', 'name').limit(500).lean() : [],
    ]);
    const items = [
      ...att.map((r) => present('attendance', r, req.user)),
      ...hz.map((r) => present('recitation', r, req.user)),
      ...note.map((r) => present('note', r, req.user)),
    ].sort((a, b) => (a.date === b.date ? new Date(b.at) - new Date(a.at) : a.date < b.date ? 1 : -1));
    res.json({ items, from, to });
  } catch (err) { next(err); }
});

// ---------- لا يُسجَّل شيء لطالب غير نشط ----------
async function loadActive(req, res) {
  const s = await loadStudent(req, res);
  if (!s) return null;
  if (s.status !== 'active') { res.status(400).json({ error: 'الطالب غير نشط، لا يمكن إضافة سجلات جديدة' }); return null; }
  return s;
}

async function absenceAlert(student) {
  const { absenceThreshold } = await getSettings();
  const recent = await Attendance.find({ studentId: student._id }).sort({ date: -1 }).limit(absenceThreshold + 1).select('status').lean();
  let streak = 0;
  for (const r of recent) { if (r.status === 'absent') streak += 1; else break; }
  if (streak === absenceThreshold) {
    await notify([student.teacherId, ...(await managerIds())], { type: 'student.absence', title: 'غياب متكرر', body: `${student.name}: غاب ${streak} أيام متتالية`, link: `/students/${student._id}` });
  }
}

// ---------- الحضور (سجل واحد لكل طالب في اليوم) ----------
studentRecords.post('/attendance', async (req, res, next) => {
  try {
    const s = await loadActive(req, res);
    if (!s) return;
    const date = req.body.date || todayStr();
    const dErr = checkDate(req.user, date);
    if (dErr) return res.status(400).json({ error: dErr });
    if (!['present', 'absent'].includes(req.body.status)) return res.status(400).json({ error: 'اختر حاضر أو غائب' });
    const note = String(req.body.note || '').trim().slice(0, 300);

    const existing = await Attendance.findOne({ studentId: s._id, date });
    if (existing) {
      if (!canEditRecord(req.user, existing)) return res.status(403).json({ error: 'سجل الحضور لهذا اليوم أنشأه معلم آخر ولا يمكنك تعديله' });
      const before = { status: existing.status, note: existing.note };
      existing.status = req.body.status; existing.note = note; existing.updatedBy = req.user._id;
      await existing.save();
      await audit(req, 'attendance.update', { targetType: 'student', target: s, details: { date, before, after: { status: existing.status, note } } });
      if (existing.status === 'absent') await absenceAlert(s);
      return res.json({ record: present('attendance', existing, req.user) });
    }
    let rec;
    try {
      rec = await Attendance.create({ studentId: s._id, date, status: req.body.status, note, createdBy: req.user._id });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'تم تسجيل حضور هذا اليوم للتو، أعد المحاولة' });
      throw e;
    }
    await audit(req, 'attendance.create', { targetType: 'student', target: s, details: { date, status: rec.status } });
    if (rec.status === 'absent') await absenceAlert(s);
    res.status(201).json({ record: present('attendance', rec, req.user) });
  } catch (err) { next(err); }
});

// ---------- الحفظ والمراجعة (أكثر من مقطع في اليوم، وتقييم مستقل لكل مقطع) ----------
studentRecords.post('/recitations', async (req, res, next) => {
  try {
    const s = await loadActive(req, res);
    if (!s) return;
    const date = req.body.date || todayStr();
    const dErr = checkDate(req.user, date);
    if (dErr) return res.status(400).json({ error: dErr });
    const settings = await getSettings();
    const c = cleanRecitation(req.body, settings.gradeScale.map((g) => g.key));
    if (c.error) return res.status(400).json({ error: c.error });
    const rec = await Recitation.create({ ...c.value, studentId: s._id, date, createdBy: req.user._id });
    await audit(req, 'recitation.create', { targetType: 'student', target: s, details: { date, ...c.value } });
    res.status(201).json({ record: present('recitation', rec, req.user) });
  } catch (err) { next(err); }
});

studentRecords.post('/notes', async (req, res, next) => {
  try {
    const s = await loadActive(req, res);
    if (!s) return;
    const date = req.body.date || todayStr();
    const dErr = checkDate(req.user, date);
    if (dErr) return res.status(400).json({ error: dErr });
    const text = String(req.body.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'نص الملاحظة مطلوب' });
    if (!CATS.includes(req.body.category)) return res.status(400).json({ error: 'اختر تصنيف الملاحظة' });
    const rec = await Note.create({ studentId: s._id, date, category: req.body.category, text, createdBy: req.user._id });
    await audit(req, 'note.create', { targetType: 'student', target: s, details: { date, category: rec.category } });
    res.status(201).json({ record: present('note', rec, req.user) });
  } catch (err) { next(err); }
});

// ---------- التعديل: صاحب السجل فقط (أو مشرف/مدير). كل تعديل موثّق بالقيم السابقة والجديدة ----------
recordEdit.patch('/:kind/:id', async (req, res, next) => {
  try {
    const Model = MODELS[req.params.kind];
    if (!Model || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'غير موجود' });
    const rec = await Model.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'غير موجود' });
    const s = await loadStudent(req, res, rec.studentId); // يطبّق العزل: المعلم لا يصل لسجل طالب ليس طالبه الحالي
    if (!s) return;
    if (!canEditRecord(req.user, rec)) return res.status(403).json({ error: 'لا يمكنك تعديل سجل أنشأه معلم آخر' });
    const before = rec.toObject();
    const b = req.body || {};

    if (req.params.kind === 'attendance') {
      if (b.status !== undefined) { if (!['present', 'absent'].includes(b.status)) return res.status(400).json({ error: 'حالة غير صحيحة' }); rec.status = b.status; }
      if (b.note !== undefined) rec.note = String(b.note).trim().slice(0, 300);
    } else if (req.params.kind === 'note') {
      if (b.category !== undefined) { if (!CATS.includes(b.category)) return res.status(400).json({ error: 'تصنيف غير صحيح' }); rec.category = b.category; }
      if (b.text !== undefined) { const t = String(b.text).trim().slice(0, 1000); if (!t) return res.status(400).json({ error: 'نص الملاحظة مطلوب' }); rec.text = t; }
    } else {
      const settings = await getSettings();
      const c = cleanRecitation({ ...before, ...b }, settings.gradeScale.map((g) => g.key));
      if (c.error) return res.status(400).json({ error: c.error });
      for (const k of ['type', 'mode', 'surah', 'fromAyah', 'toAyah', 'fromPage', 'toPage', 'grade']) rec[k] = c.value[k];
    }
    rec.updatedBy = req.user._id;
    await rec.save();
    await audit(req, `${req.params.kind}.update`, { targetType: 'student', target: s, details: { date: rec.date, before, after: rec.toObject() } });
    await rec.populate('createdBy', 'name');
    res.json({ record: present(req.params.kind, rec, req.user) });
  } catch (err) { next(err); }
});

module.exports = { studentRecords, recordEdit };
