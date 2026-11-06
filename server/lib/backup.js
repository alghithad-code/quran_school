const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const M = require('../models');
const { getSettings } = require('./settings');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const { EJSON } = mongoose.mongo.BSON;

// المجموعات المشمولة. لا تدخل الجلسات ولا سجلات النسخ نفسها.
const MODELS = [User, AuditLog, M.Level, M.Group, M.GroupMessage, M.Student, M.Enrollment, M.Attendance, M.Recitation, M.Note, M.Transfer, M.LevelChange, M.PromotionRequest, M.Notification, M.Setting, M.Reader];
const names = () => MODELS.map((m) => m.collection.name);
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'backups' });

function putFile(filename, buf) {
  return new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(filename);
    up.on('error', reject);
    up.on('finish', () => resolve(up.id));
    up.end(buf);
  });
}
async function readFile(fileId) {
  const chunks = [];
  for await (const c of bucket().openDownloadStream(fileId)) chunks.push(c);
  return Buffer.concat(chunks);
}

async function dump() {
  const data = {}, counts = {};
  for (const m of MODELS) {
    // نقرأ من الـ driver مباشرة ليشمل الحقول المخفية مثل passwordHash (تجزئة فقط، لا أسرار اتصال)
    const docs = await mongoose.connection.db.collection(m.collection.name).find({}).toArray();
    data[m.collection.name] = docs;
    counts[m.collection.name] = docs.length;
  }
  const payload = { format: 'quran-school-backup', version: 1, createdAt: new Date(), counts, data };
  const buf = await gzip(Buffer.from(EJSON.stringify(payload, { relaxed: false })));
  return { buf, counts };
}

async function createBackup(kind, userId = null) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `quran-school-${kind}-${stamp}.json.gz`;
  try {
    const { buf, counts } = await dump();
    const checksum = crypto.createHash('sha256').update(buf).digest('hex');
    const fileId = await putFile(filename, buf);
    const rec = await M.Backup.create({ kind, status: 'success', filename, fileId, size: buf.length, checksum, counts, createdBy: userId });
    await prune();
    return rec;
  } catch (err) {
    console.error('backup failed:', err.message);
    return M.Backup.create({ kind, status: 'failed', filename, error: 'فشل إنشاء النسخة، راجع سجلات الخادم', createdBy: userId });
  }
}

// نحتفظ بآخر N نسخة تلقائية فقط. النسخ اليدوية وما قبل الاستعادة لا تُحذف تلقائياً (إلا أقدم من آخر 5 قبل-الاستعادة).
async function prune() {
  const { backupKeep } = await getSettings();
  const rm = async (list) => { for (const b of list) { try { if (b.fileId) await bucket().delete(b.fileId); } catch { /* الملف محذوف مسبقاً */ } await b.deleteOne(); } };
  await rm((await M.Backup.find({ kind: 'auto' }).sort({ createdAt: -1 }).skip(backupKeep)));
  await rm((await M.Backup.find({ kind: 'pre-restore' }).sort({ createdAt: -1 }).skip(5)));
}

// يتحقق من سلامة الملف قبل أي استعادة: الصيغة، الأعداد، وجود مدير نظام نشط
function parseBackup(buf) {
  let payload;
  try { payload = EJSON.parse(zlib.gunzipSync(buf).toString('utf8'), { relaxed: false }); } catch { throw new Error('ملف النسخة تالف أو غير مدعوم'); }
  if (payload?.format !== 'quran-school-backup' || payload.version !== 1 || !payload.data) throw new Error('هذا الملف ليس نسخة احتياطية لهذا النظام');
  const OPTIONAL = new Set([M.Group.collection.name, M.GroupMessage.collection.name, M.Enrollment.collection.name, M.Reader.collection.name]); // مجموعات أُضيفت لاحقاً: النسخ الأقدم لا تحويها
  for (const n of names()) {
    if (OPTIONAL.has(n) && payload.data[n] === undefined) { payload.data[n] = []; payload.counts = { ...payload.counts, [n]: 0 }; }
    const docs = payload.data[n];
    if (!Array.isArray(docs) || docs.length !== payload.counts?.[n]) throw new Error(`النسخة ناقصة أو غير متسقة (${n})`);
    if (!docs.every((d) => d && d._id)) throw new Error(`سجلات غير صالحة في (${n})`);
  }
  const uname = User.collection.name;
  if (!payload.data[uname].some((u) => u.role === 'admin' && u.status === 'active')) throw new Error('النسخة لا تحتوي مدير نظام نشطاً، رُفضت الاستعادة');
  return payload;
}

async function applyPayload(payload) {
  const db = mongoose.connection.db;
  for (const n of names()) {
    const docs = payload.data[n];
    await db.collection(n).deleteMany({});
    if (docs.length) await db.collection(n).insertMany(docs, { ordered: true });
  }
}

async function restore(backup, userId) {
  const buf = await readFile(backup.fileId);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== backup.checksum) throw new Error('فشل التحقق من سلامة الملف (checksum)');
  const payload = parseBackup(buf); // التحقق أولاً قبل المساس بأي بيانات
  const safety = await createBackup('pre-restore', userId); // نسخة أمان من الوضع الحالي
  if (safety.status !== 'success') throw new Error('تعذّر إنشاء نسخة أمان قبل الاستعادة، أُلغيت العملية دون أي تغيير');
  try {
    await applyPayload(payload);
  } catch (err) {
    console.error('restore failed, rolling back:', err.message);
    try { await applyPayload(parseBackup(await readFile(safety.fileId))); } catch (e2) { console.error('ROLLBACK FAILED:', e2.message); throw new Error('فشلت الاستعادة وتعذّر الرجوع تلقائياً. نسخة الأمان محفوظة باسم ' + safety.filename); }
    throw new Error('فشلت الاستعادة، وتم الرجوع إلى الوضع السابق بنجاح');
  }
  return { counts: payload.counts, safety: safety.filename };
}

// يخزّن ملفاً مرفوعاً (بعد التحقق منه) ليمكن استعادته
async function importUploaded(buf, userId) {
  const payload = parseBackup(buf);
  const checksum = crypto.createHash('sha256').update(buf).digest('hex');
  const filename = `quran-school-uploaded-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
  const fileId = await putFile(filename, buf);
  return M.Backup.create({ kind: 'uploaded', status: 'success', filename, fileId, size: buf.length, checksum, counts: payload.counts, createdBy: userId });
}

module.exports = { createBackup, restore, importUploaded, bucket };
