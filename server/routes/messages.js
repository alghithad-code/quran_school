const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { InboxMessage, InboxRecipient, Student, Enrollment, Level } = require('../models');
const { requireAuth, requireAnyAuth } = require('../middleware/auth');
const { isManager } = require('../lib/access');
const { getSettings } = require('../lib/settings');
const { cleanMessage, detectFileType, safeName, MAX_FILE_BYTES } = require('../lib/messageRules');
const { bucket, purgeMessages } = require('../lib/messageFiles');

const router = express.Router();
const oidOk = (v) => mongoose.isValidObjectId(v);
const PAGE = 20;

// حدّ للإرسال والرفع لكل مستخدم (حماية من الإزعاج)
const perUser = (limit, message) => rateLimit({ windowMs: 60 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => String(req.user._id), message: { error: message } });
const sendLimiter = perUser(40, 'أرسلت رسائل كثيرة، حاول لاحقاً');
const uploadLimiter = perUser(60, 'رفعت ملفات كثيرة، حاول لاحقاً');

// الإرسال: للمدير والمشرف دائماً، وللمعلم إذا سمح مدير النظام من الإعدادات
async function canSend(user) {
  if (isManager(user)) return true;
  return user.role === 'teacher' && !!(await getSettings()).teachersCanMessage;
}

// ---------- الوارد (معلم، مشرف، مدير، طالب) ----------
router.get('/inbox/count', requireAnyAuth, async (req, res, next) => {
  try { res.json({ unread: await InboxRecipient.countDocuments({ userId: req.user._id, read: false }) }); } catch (e) { next(e); }
});

router.get('/inbox', requireAnyAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || PAGE));
    const f = { userId: req.user._id, ...(req.query.unread === '1' ? { read: false } : {}) };
    const [rows, total, unread] = await Promise.all([
      InboxRecipient.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      InboxRecipient.countDocuments(f),
      InboxRecipient.countDocuments({ userId: req.user._id, read: false }),
    ]);
    const msgs = await InboxMessage.find({ _id: { $in: rows.map((r) => r.messageId) } }).lean();
    const mm = new Map(msgs.map((m) => [String(m._id), m]));
    const items = rows.filter((r) => mm.has(String(r.messageId))).map((r) => {
      const m = mm.get(String(r.messageId));
      return {
        id: r._id, title: m.title, body: m.body, at: m.createdAt, read: r.read, readAt: r.readAt,
        sender: { name: m.senderName, role: m.senderRole },
        attachments: (m.attachments || []).map((a) => ({ id: a.fileId, name: a.name, size: a.size, mime: a.mime })),
      };
    });
    res.json({ items, total, pages: Math.ceil(total / limit), unread });
  } catch (e) { next(e); }
});

// تأكيد القراءة: بزر صريح من المستلم نفسه فقط
router.post('/inbox/:rid/read', requireAnyAuth, async (req, res, next) => {
  try {
    if (!oidOk(req.params.rid)) return res.status(404).json({ error: 'غير موجود' });
    await InboxRecipient.updateOne({ _id: req.params.rid, userId: req.user._id, read: false }, { $set: { read: true, readAt: new Date() } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- تنزيل مرفق: المرسِل أو المستلم أو الإدارة فقط ----------
router.get('/files/:fileId', requireAnyAuth, async (req, res, next) => {
  try {
    if (!oidOk(req.params.fileId)) return res.status(404).json({ error: 'غير موجود' });
    const b = bucket();
    const [file] = await b.find({ _id: new mongoose.Types.ObjectId(req.params.fileId) }).toArray();
    const mid = file?.metadata?.messageId;
    if (!file || !mid) return res.status(404).json({ error: 'غير موجود' });
    const msg = await InboxMessage.findById(mid).select('senderId').lean();
    const allowed = msg && (String(msg.senderId) === String(req.user._id) || isManager(req.user)
      || await InboxRecipient.exists({ messageId: mid, userId: req.user._id }));
    if (!allowed) return res.status(404).json({ error: 'غير موجود' });
    const inline = file.metadata.mime.startsWith('image/');
    res.set({
      'Content-Type': file.metadata.mime, 'Content-Length': file.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.metadata.name)}`,
    });
    b.openDownloadStream(file._id).on('error', next).pipe(res);
  } catch (e) { next(e); }
});

// ---------- الإرسال والمرسَل (معلم، مشرف، مدير) ----------
router.post('/attachments', requireAuth, uploadLimiter, express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES }), async (req, res, next) => {
  try {
    if (!(await canSend(req.user))) return res.status(403).json({ error: 'إرسال الرسائل غير مفعّل لك' });
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'لم يصل ملف' });
    const type = detectFileType(buf);
    if (!type) return res.status(400).json({ error: 'نوع الملف غير مسموح. المسموح: صور (JPG/PNG/WebP/GIF) وPDF' });
    const name = safeName(req.query.name, type.ext);
    const up = bucket().openUploadStream(name, { metadata: { ownerId: req.user._id, mime: type.mime, name, size: buf.length, messageId: null } });
    await new Promise((resolve, reject) => up.on('error', reject).on('finish', resolve).end(buf));
    res.status(201).json({ id: up.id, name, size: buf.length, mime: type.mime });
  } catch (e) { next(e); }
});

const names = (arr) => arr.map((x) => x.name).join('، ');

router.post('/', requireAuth, sendLimiter, async (req, res, next) => {
  try {
    if (!(await canSend(req.user))) return res.status(403).json({ error: 'إرسال الرسائل غير مفعّل للمعلمين. راجع مدير النظام' });
    const c = cleanMessage(req.body, req.user.role);
    if (c.error) return res.status(400).json({ error: c.error });
    const v = c.value;
    const manager = isManager(req.user);

    if (v.requestId) { // الطلب نفسه أُرسل من قبل (ضغط متكرر أو إعادة إرسال)
      const prev = await InboxMessage.findOne({ senderId: req.user._id, requestId: v.requestId }).lean();
      if (prev) return res.json({ duplicate: true, id: prev._id, recipients: prev.recipientCount, skipped: prev.skipped, scopeLabel: prev.scopeLabel });
    }

    // ----- تحديد المستلمين (والتحقق من صلاحية الوصول إليهم في الخادم) -----
    let recipients = [], skipped = 0, scopeLabel = '';
    if (v.audience === 'teachers') {
      const f = { role: 'teacher', status: 'active', ...(v.scope === 'selected' ? { _id: { $in: v.teacherIds } } : {}) };
      recipients = (await User.find(f).select('name').lean()).map((u) => ({ userId: u._id, name: u.name }));
      scopeLabel = v.scope === 'all' ? 'كل المعلمين' : `معلمون محددون (${recipients.length})`;
    } else {
      let studentIds;
      if (v.scope === 'student') {
        const st = oidOk(v.studentId) ? await Student.findById(v.studentId).select('name status').lean() : null;
        if (!st) return res.status(404).json({ error: 'الطالب غير موجود' });
        if (!manager && !(await Enrollment.exists({ studentId: st._id, teacherId: req.user._id, status: 'active' }))) return res.status(403).json({ error: 'هذا الطالب ليس من طلابك' });
        studentIds = [st._id]; scopeLabel = st.name;
      } else if (!manager) { // المعلم: كل طلابه الفعليين
        studentIds = await Enrollment.distinct('studentId', { teacherId: req.user._id, status: 'active' });
        scopeLabel = 'كل طلابي';
      } else if (v.scope === 'all') {
        studentIds = await Student.distinct('_id', { status: 'active' });
        scopeLabel = 'كل الطلاب';
      } else { // تصفية بالمستوى و/أو المعلم
        const ef = { status: 'active', ...(v.levelIds.length ? { levelId: { $in: v.levelIds } } : {}), ...(v.teacherIds.length ? { teacherId: { $in: v.teacherIds } } : {}) };
        studentIds = await Enrollment.distinct('studentId', ef);
        const [lv, tc] = await Promise.all([v.levelIds.length ? Level.find({ _id: { $in: v.levelIds } }).select('name').lean() : [], v.teacherIds.length ? User.find({ _id: { $in: v.teacherIds } }).select('name').lean() : []]);
        scopeLabel = ['طلاب', lv.length && `المستوى: ${names(lv)}`, tc.length && `المعلم: ${names(tc)}`].filter(Boolean).join(' — ');
      }
      const students = await Student.find({ _id: { $in: studentIds }, ...(v.scope === 'student' ? {} : { status: 'active' }) }).select('name').lean();
      const nm = new Map(students.map((s) => [String(s._id), s.name]));
      const accts = await User.find({ role: 'student', status: 'active', studentId: { $in: [...nm.keys()] } }).select('studentId').lean();
      recipients = accts.map((a) => ({ userId: a._id, name: nm.get(String(a.studentId)) }));
      skipped = nm.size - recipients.length; // طلاب بلا حساب (أو حسابهم موقوف) لن تصلهم الرسالة
    }
    if (!recipients.length) {
      return res.status(400).json({ error: v.audience === 'students' && skipped ? 'الطلاب المحددون ليس لديهم حسابات فعّالة، فلا يمكن إيصال الرسالة لهم' : 'لا يوجد مستلمون لهذه الرسالة' });
    }

    // ----- المرفقات: يجب أن تكون مرفوعة من المرسِل نفسه ولم تُستخدم قبلاً -----
    let attachments = [];
    if (v.attachmentIds.length) {
      const files = await bucket().find({ _id: { $in: v.attachmentIds.map((i) => new mongoose.Types.ObjectId(i)) }, 'metadata.ownerId': req.user._id, 'metadata.messageId': null }).toArray();
      if (files.length !== v.attachmentIds.length) return res.status(400).json({ error: 'أحد المرفقات غير صالح، أعد رفعه' });
      attachments = files.map((f) => ({ fileId: f._id, name: f.metadata.name, size: f.metadata.size, mime: f.metadata.mime }));
    }

    // ----- الحفظ: الرسالة ومستلموها ومرفقاتها معاً -----
    let msg;
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          [msg] = await InboxMessage.create([{
            senderId: req.user._id, senderName: req.user.name, senderRole: req.user.role, title: v.title, body: v.body,
            audience: v.audience, scopeLabel, attachments, recipientCount: recipients.length, skipped, ...(v.requestId ? { requestId: v.requestId } : {}),
          }], { session });
          await InboxRecipient.insertMany(recipients.map((r) => ({ messageId: msg._id, userId: r.userId, name: r.name })), { session });
          if (attachments.length) await mongoose.connection.db.collection('msgfiles.files').updateMany({ _id: { $in: attachments.map((a) => a.fileId) } }, { $set: { 'metadata.messageId': msg._id } }, { session });
        });
      } finally { session.endSession(); }
    } catch (er) {
      if (er.code === 11000 && v.requestId) {
        const prev = await InboxMessage.findOne({ senderId: req.user._id, requestId: v.requestId }).lean();
        if (prev) return res.json({ duplicate: true, id: prev._id, recipients: prev.recipientCount, skipped: prev.skipped, scopeLabel: prev.scopeLabel });
      }
      throw er;
    }
    res.status(201).json({ duplicate: false, id: msg._id, recipients: recipients.length, skipped, scopeLabel });
  } catch (e) { next(e); }
});

// الصادر: المرسِل يرى رسائله، والمدير والمشرف يرون كل الرسائل
const sentFilter = (u) => (isManager(u) ? {} : { senderId: u._id });
router.get('/sent', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const f = { ...sentFilter(req.user), ...(req.query.mine === '1' ? { senderId: req.user._id } : {}) };
    const [items, total] = await Promise.all([
      InboxMessage.find(f).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
      InboxMessage.countDocuments(f),
    ]);
    const reads = await InboxRecipient.aggregate([{ $match: { messageId: { $in: items.map((m) => m._id) } } }, { $group: { _id: '$messageId', read: { $sum: { $cond: ['$read', 1, 0] } } } }]);
    const rm = new Map(reads.map((r) => [String(r._id), r.read]));
    res.json({
      items: items.map((m) => ({
        id: m._id, title: m.title, preview: m.body.slice(0, 120), at: m.createdAt, audience: m.audience, scopeLabel: m.scopeLabel,
        sender: { name: m.senderName, role: m.senderRole, mine: String(m.senderId) === String(req.user._id) },
        recipients: m.recipientCount, read: rm.get(String(m._id)) || 0, skipped: m.skipped, attachments: (m.attachments || []).length,
      })),
      total, pages: Math.ceil(total / PAGE),
    });
  } catch (e) { next(e); }
});

async function loadSent(req, res) {
  if (!oidOk(req.params.id)) { res.status(404).json({ error: 'غير موجود' }); return null; }
  const m = await InboxMessage.findOne({ _id: req.params.id, ...sentFilter(req.user) });
  if (!m) { res.status(404).json({ error: 'غير موجود' }); return null; }
  return m;
}

router.get('/sent/:id', requireAuth, async (req, res, next) => {
  try {
    const m = await loadSent(req, res);
    if (!m) return;
    const rec = await InboxRecipient.find({ messageId: m._id }).sort({ read: 1, name: 1 }).lean();
    res.json({
      message: {
        id: m._id, title: m.title, body: m.body, at: m.createdAt, audience: m.audience, scopeLabel: m.scopeLabel, skipped: m.skipped,
        sender: { name: m.senderName, role: m.senderRole },
        attachments: m.attachments.map((a) => ({ id: a.fileId, name: a.name, size: a.size, mime: a.mime })),
      },
      recipients: rec.map((r) => ({ name: r.name, read: r.read, readAt: r.readAt })),
    });
  } catch (e) { next(e); }
});

router.delete('/sent/:id', requireAuth, async (req, res, next) => {
  try {
    const m = await loadSent(req, res);
    if (!m) return;
    await purgeMessages([m._id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
