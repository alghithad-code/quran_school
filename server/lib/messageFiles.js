const mongoose = require('mongoose');
const { InboxMessage, InboxRecipient } = require('../models');

// مرفقات الرسائل في GridFS (حاوية msgfiles)، منفصلة عن النسخ الاحتياطية.
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'msgfiles' });

async function deleteFiles(filter) {
  const b = bucket();
  const files = await b.find(filter).toArray();
  for (const f of files) { try { await b.delete(f._id); } catch { /* محذوف مسبقاً */ } }
  return files.length;
}

// يحذف رسائل بمستلميها ومرفقاتها
async function purgeMessages(ids) {
  if (!ids.length) return;
  await deleteFiles({ 'metadata.messageId': { $in: ids } });
  await InboxRecipient.deleteMany({ messageId: { $in: ids } });
  await InboxMessage.deleteMany({ _id: { $in: ids } });
}

// تنظيف دوري: الرسائل الأقدم من مدة الاحتفاظ، والمرفقات المرفوعة ولم تُرسل (أقدم من يوم)
async function cleanupMessages(retentionDays) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
  for (;;) {
    const old = await InboxMessage.find({ createdAt: { $lt: cutoff } }).select('_id').limit(200).lean();
    if (!old.length) break;
    await purgeMessages(old.map((m) => m._id));
  }
  await deleteFiles({ 'metadata.messageId': null, uploadDate: { $lt: new Date(Date.now() - 24 * 3600 * 1000) } });
}

module.exports = { bucket, deleteFiles, purgeMessages, cleanupMessages };
