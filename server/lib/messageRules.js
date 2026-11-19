// قواعد الرسائل (دوال نقية للاختبار): التحقق من الطلب بحسب دور المرسِل، وفحص نوع المرفق من محتواه.
const MAX_TITLE = 100;
const MAX_BODY = 2000;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IDS = 300; // أقصى عدد معلمين/مستويات في اختيار واحد

const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const idList = (v) => (Array.isArray(v) ? [...new Set(v.filter(isId))].slice(0, MAX_IDS) : []);

// المرسِل مدير/مشرف: للمعلمين (الكل | محددون) أو للطلاب (الكل | تصفية بالمستوى والمعلم | طالب واحد) أو للاثنين معاً (الكل).
// المرسِل معلم: لطلابه فقط (الكل | طالب واحد). يعيد { value } أو { error }.
function cleanMessage(body, role) {
  const b = body || {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const text = typeof b.body === 'string' ? b.body.trim() : '';
  const files = Array.isArray(b.attachmentIds) ? [...new Set(b.attachmentIds.filter(isId))] : [];
  if (title.length > MAX_TITLE) return { error: `العنوان أطول من ${MAX_TITLE} حرفاً` };
  if (text.length > MAX_BODY) return { error: `نص الرسالة أطول من ${MAX_BODY} حرف` };
  if (!text && !files.length) return { error: 'اكتب نص الرسالة أو أرفق ملفاً' };
  if (files.length > MAX_FILES) return { error: `الحد الأقصى ${MAX_FILES} مرفقات` };

  const manager = role === 'admin' || role === 'supervisor';
  if (!manager && role !== 'teacher') return { error: 'غير مسموح' };
  const audience = b.audience;
  if (!['teachers', 'students', 'both'].includes(audience)) return { error: 'اختر المستلمين: المعلمون أو الطلاب أو الاثنان معاً' };
  if (!manager && audience !== 'students') return { error: 'المعلم يراسل طلابه فقط' };

  let scope = b.scope, teacherIds = [], levelIds = [], studentId = null;
  if (audience === 'both') {
    scope = 'all'; // للمعلمين والطلاب معاً: كل المعلمين وكل الطلاب (للمدير والمشرف فقط)
  } else if (audience === 'teachers') {
    if (!['all', 'selected'].includes(scope)) return { error: 'اختر: كل المعلمين أو معلمين محددين' };
    if (scope === 'selected') { teacherIds = idList(b.teacherIds); if (!teacherIds.length) return { error: 'اختر معلماً واحداً على الأقل' }; }
  } else if (manager) {
    if (!['all', 'filter', 'student'].includes(scope)) return { error: 'اختر: كل الطلاب أو تصفية أو طالب واحد' };
    if (scope === 'filter') {
      teacherIds = idList(b.teacherIds); levelIds = idList(b.levelIds);
      if (!teacherIds.length && !levelIds.length) return { error: 'اختر مستوى أو معلماً واحداً على الأقل للتصفية' };
    }
  } else if (!['all', 'student'].includes(scope)) return { error: 'اختر: كل طلابك أو طالب واحد' };
  if (scope === 'student') { if (!isId(b.studentId)) return { error: 'اختر الطالب' }; studentId = b.studentId; }

  const requestId = b.requestId === undefined ? null : String(b.requestId);
  if (requestId !== null && !/^[\w-]{8,64}$/.test(requestId)) return { error: 'معرّف الطلب غير صحيح' };
  return { value: { title, body: text, audience, scope, teacherIds, levelIds, studentId, attachmentIds: files, requestId } };
}

// نوع الملف من بدايته (لا نثق باسم الملف ولا بما يرسله المتصفح). المسموح: صور JPG/PNG/WebP/GIF وPDF
function detectFileType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (['GIF87a', 'GIF89a'].includes(buf.slice(0, 6).toString('latin1'))) return { mime: 'image/gif', ext: 'gif' };
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

// اسم ملف آمن للعرض (بلا مسارات ولا رموز تحكم)
function safeName(name, ext) {
  const base = String(name || 'ملف').replace(/[\\/\u0000-\u001f"<>|?*:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'ملف';
  return /\.[a-z0-9]{2,4}$/i.test(base) ? base : `${base}.${ext}`;
}

module.exports = { cleanMessage, detectFileType, safeName, MAX_TITLE, MAX_BODY, MAX_FILES, MAX_FILE_BYTES };
