const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanMessage, detectFileType, safeName } = require('../lib/messageRules');

const id = (n) => String(n).padStart(24, 'a');
const msg = (o) => ({ body: 'السلام عليكم', ...o });

test('مدير: لكل المعلمين / لمعلمين محددين', () => {
  assert.equal(cleanMessage(msg({ audience: 'teachers', scope: 'all' }), 'admin').value.scope, 'all');
  const r = cleanMessage(msg({ audience: 'teachers', scope: 'selected', teacherIds: [id(1), id(1), 'bad'] }), 'supervisor');
  assert.deepEqual(r.value.teacherIds, [id(1)]);
  assert.match(cleanMessage(msg({ audience: 'teachers', scope: 'selected', teacherIds: [] }), 'admin').error, /معلماً/);
});

test('مدير: لكل الطلاب / تصفية / طالب واحد', () => {
  assert.equal(cleanMessage(msg({ audience: 'students', scope: 'all' }), 'admin').value.audience, 'students');
  const f = cleanMessage(msg({ audience: 'students', scope: 'filter', levelIds: [id(2)], teacherIds: [id(3)] }), 'admin');
  assert.deepEqual([f.value.levelIds, f.value.teacherIds], [[id(2)], [id(3)]]);
  assert.match(cleanMessage(msg({ audience: 'students', scope: 'filter' }), 'admin').error, /مستوى أو معلماً/);
  assert.equal(cleanMessage(msg({ audience: 'students', scope: 'student', studentId: id(4) }), 'admin').value.studentId, id(4));
  assert.match(cleanMessage(msg({ audience: 'students', scope: 'student' }), 'admin').error, /اختر الطالب/);
});

test('معلم: لطلابه فقط (الكل أو طالب واحد)، ولا يراسل المعلمين ولا يستخدم التصفية', () => {
  assert.ok(cleanMessage(msg({ audience: 'students', scope: 'all' }), 'teacher').value);
  assert.ok(cleanMessage(msg({ audience: 'students', scope: 'student', studentId: id(5) }), 'teacher').value);
  assert.match(cleanMessage(msg({ audience: 'teachers', scope: 'all' }), 'teacher').error, /طلابه فقط/);
  assert.ok(cleanMessage(msg({ audience: 'students', scope: 'filter', levelIds: [id(2)] }), 'teacher').error);
});

test('الطالب لا يرسل، والدور غير المعروف مرفوض', () => {
  assert.ok(cleanMessage(msg({ audience: 'students', scope: 'all' }), 'student').error);
  assert.ok(cleanMessage(msg({ audience: 'students', scope: 'all' }), undefined).error);
});

test('المحتوى: نص أو مرفق مطلوب، وحدود الطول والمرفقات', () => {
  assert.match(cleanMessage({ audience: 'students', scope: 'all' }, 'admin').error, /نص الرسالة/);
  assert.ok(cleanMessage({ audience: 'students', scope: 'all', attachmentIds: [id(9)] }, 'admin').value);
  assert.match(cleanMessage(msg({ audience: 'students', scope: 'all', body: 'x'.repeat(2001) }), 'admin').error, /أطول/);
  assert.match(cleanMessage(msg({ audience: 'students', scope: 'all', title: 'x'.repeat(101) }), 'admin').error, /العنوان/);
  assert.match(cleanMessage(msg({ audience: 'students', scope: 'all', attachmentIds: [id(1), id(2), id(3), id(4)] }), 'admin').error, /3 مرفقات/);
  assert.match(cleanMessage(msg({ audience: 'students', scope: 'all', requestId: 'x' }), 'admin').error, /معرّف/);
});

test('فحص نوع الملف من محتواه: يقبل الصور وPDF ويرفض غيرها حتى لو سُمّي بامتداد صورة', () => {
  const pad = Buffer.alloc(20);
  assert.equal(detectFileType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad])).mime, 'image/jpeg');
  assert.equal(detectFileType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad])).mime, 'image/png');
  assert.equal(detectFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), pad])).mime, 'image/webp');
  assert.equal(detectFileType(Buffer.concat([Buffer.from('GIF89a'), pad])).mime, 'image/gif');
  assert.equal(detectFileType(Buffer.concat([Buffer.from('%PDF-1.7'), pad])).mime, 'application/pdf');
  assert.equal(detectFileType(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(detectFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectFileType(Buffer.from('MZ' + 'x'.repeat(30))), null);
  assert.equal(detectFileType(Buffer.alloc(3)), null);
});

test('اسم الملف: ينظَّف من المسارات والرموز ويضاف الامتداد عند غيابه', () => {
  assert.ok(!safeName('../../etc/passwd', 'jpg').includes('/') && safeName('../../etc/passwd', 'jpg').endsWith('.jpg'));
  assert.equal(safeName('صورة الحلقة', 'png'), 'صورة الحلقة.png');
  assert.equal(safeName('درس.pdf', 'pdf'), 'درس.pdf');
  assert.equal(safeName('', 'pdf'), 'ملف.pdf');
  assert.ok(!/[\\/"<>|?*:]/.test(safeName('a/b\\c"d<e>f|g?h*i:j', 'jpg')));
});
