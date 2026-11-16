const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanBatch } = require('../lib/recitationBatch');
const { SURAHS } = require('../data/quran');

const base = { levelSurahs: [1, 2, 112, 113, 114], gradeKeys: ['excellent', 'good', 'redo'] };
const run = (body, opts = base) => cleanBatch(body, opts);

test('حفظ عدة سور كاملة: يحدد النظام النطاق تلقائياً ويطبق تقييماً موحداً', () => {
  const r = run({ type: 'hifz', gradeMode: 'same', grade: 'good', items: [{ surah: 112, scope: 'full' }, { surah: 113, scope: 'full' }, { surah: 114, scope: 'full' }] });
  assert.deepEqual(r.value.items, [
    { surah: 112, fromAyah: 1, toAyah: 4, grade: 'good' },
    { surah: 113, fromAyah: 1, toAyah: 5, grade: 'good' },
    { surah: 114, fromAyah: 1, toAyah: 6, grade: 'good' },
  ]);
  assert.equal(r.value.type, 'hifz');
});

test('مراجعة عدة سور كاملة', () => {
  const r = run({ type: 'review', items: [{ surah: 1, scope: 'full' }, { surah: 2, scope: 'full' }] });
  assert.equal(r.value.type, 'review');
  assert.equal(r.value.items[1].toAyah, SURAHS[1].ayahs);
  assert.equal(r.value.items[0].grade, null);
});

test('الجمع بين سورة كاملة وسورة بآيات محددة في العملية نفسها', () => {
  const r = run({ type: 'hifz', items: [{ surah: 1, scope: 'full' }, { surah: 2, scope: 'range', fromAyah: 5, toAyah: 20 }] });
  assert.deepEqual(r.value.items.map((i) => [i.surah, i.fromAyah, i.toAyah]), [[1, 1, 7], [2, 5, 20]]);
});

test('تقييم مستقل لكل سورة، وكل تقييم يرتبط بسورته', () => {
  const r = run({ type: 'hifz', gradeMode: 'each', grade: 'redo', items: [{ surah: 112, scope: 'full', grade: 'excellent' }, { surah: 113, scope: 'full', grade: 'good' }, { surah: 114, scope: 'full' }] });
  assert.deepEqual(r.value.items.map((i) => [i.surah, i.grade]), [[112, 'excellent'], [113, 'good'], [114, null]]);
});

test('التقييم الموحد يتجاهل التقييمات الفردية والعكس', () => {
  const same = run({ type: 'hifz', gradeMode: 'same', grade: 'good', items: [{ surah: 1, scope: 'full', grade: 'redo' }] });
  assert.equal(same.value.items[0].grade, 'good');
});

test('يُرفض: سورة خارج مقررات المستوى', () => {
  assert.match(run({ type: 'hifz', items: [{ surah: 3, scope: 'full' }] }).error, /ليست من سور مستوى/);
});

test('يُرفض: نطاق آيات خاطئ (تجاوز، معكوس، ناقص)', () => {
  assert.match(run({ type: 'hifz', items: [{ surah: 1, scope: 'range', fromAyah: 1, toAyah: 8 }] }).error, /بين 1 و7/);
  assert.match(run({ type: 'hifz', items: [{ surah: 2, scope: 'range', fromAyah: 10, toAyah: 5 }] }).error, /من ≤ إلى/);
  assert.match(run({ type: 'hifz', items: [{ surah: 2, scope: 'range', fromAyah: '', toAyah: 5 }] }).error, /بين 1/);
  assert.match(run({ type: 'hifz', items: [{ surah: 2 }] }).error, /اختر السورة كاملة/);
});

test('يُرفض: بيانات ناقصة أو غير صحيحة', () => {
  assert.ok(run({ type: 'x', items: [{ surah: 1, scope: 'full' }] }).error);
  assert.match(run({ type: 'hifz', items: [] }).error, /سورة واحدة/);
  assert.match(run({ type: 'hifz' }).error, /سورة واحدة/);
  assert.match(run({ type: 'hifz', grade: 'nope', items: [{ surah: 1, scope: 'full' }] }).error, /التقييم/);
  assert.match(run({ type: 'hifz', gradeMode: 'each', items: [{ surah: 1, scope: 'full', grade: 'nope' }] }).error, /التقييم/);
  assert.match(run({ type: 'hifz', items: [{ surah: 1, scope: 'full' }, { surah: 1, scope: 'full' }] }).error, /مكررة/);
  assert.match(run({ type: 'hifz', items: [{ surah: 1, scope: 'full' }], requestId: 'x' }).error, /معرّف/);
});

test('يُرفض التسجيل الجماعي لمستوى بلا سور محددة', () => {
  assert.match(run({ type: 'hifz', items: [{ surah: 1, scope: 'full' }] }, { levelSurahs: [], gradeKeys: [] }).error, /لا توجد سور محددة/);
});

test('requestId صالح يُقبل (لمنع التكرار)', () => {
  const r = run({ type: 'hifz', requestId: '3f2c1a9e-aaaa-bbbb-cccc-1234567890ab', items: [{ surah: 1, scope: 'full' }] });
  assert.equal(r.value.requestId, '3f2c1a9e-aaaa-bbbb-cccc-1234567890ab');
});
