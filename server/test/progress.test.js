const test = require('node:test');
const assert = require('node:assert/strict');
const { computeProgress } = require('../lib/progressCalc');
const { SURAHS } = require('../data/quran');

const A = (n) => SURAHS[n - 1].ayahs; // عدد آيات السورة
const scores = { excellent: 100, good: 70, redo: 0 };
const rec = (surah, fromAyah, toAyah, grade = 'good') => ({ surah, fromAyah, toAyah, grade });

test('الحفظ: سورة كاملة وجزء من أخرى، والنسبة من مجموع الآيات لا متوسط النسب', () => {
  // الفاتحة (7) كاملة + الناس (6) نصفها = 10 من 13
  const p = computeProgress([1, 114], [rec(1, 1, 7), rec(114, 1, 3)], [], scores, { detail: true });
  assert.equal(p.memorized, 10);
  assert.equal(p.total, 13);
  assert.equal(p.pct, 76.9);
  assert.equal(p.surahs[0].memorized, 7);
  assert.equal(p.surahs[1].memorized, 3);
});

test('الحفظ: تكرار تسجيل الآية لا يُحتسب مرتين، والمقاطع المتداخلة تُدمج', () => {
  const p = computeProgress([2], [rec(2, 1, 10), rec(2, 5, 15), rec(2, 1, 10)], [], scores, { detail: true });
  assert.equal(p.memorized, 15);
  assert.deepEqual(p.surahs[0].ranges, [[1, 15]]);
});

test('الحفظ: التقييم الذي درجته صفر لا يُحتسب، ومن بلا تقييم يُحتسب', () => {
  const p = computeProgress([1], [rec(1, 1, 3, 'redo'), rec(1, 4, 5, null), rec(1, 6, 7, 'excellent')], [], scores);
  assert.equal(p.memorized, 4);
});

test('المراجعة: حساب مستقل عن الحفظ ولا تتكرر الآية المراجَعة عدة مرات', () => {
  const p = computeProgress([1, 114], [rec(1, 1, 7)], [rec(114, 1, 6), rec(114, 1, 6), rec(114, 2, 4), rec(1, 1, 2)], scores, { detail: true });
  assert.equal(p.memorized, 7); // الحفظ لم يتأثر بالمراجعة
  assert.equal(p.review.reviewed, 8); // الناس 6 + الفاتحة 2، بلا تكرار
  assert.equal(p.review.total, 13);
  assert.equal(p.review.pct, 61.5);
  assert.equal(p.surahs[1].reviewed, 6);
  assert.deepEqual(p.surahs[0].reviewRanges, [[1, 2]]);
});

test('المراجعة: تُحتسب حتى لو كان تقييمها «يحتاج إعادة»، والحفظ لا يتأثر بسجلات المراجعة', () => {
  const p = computeProgress([1], [], [rec(1, 1, 7, 'redo')], scores);
  assert.equal(p.review.reviewed, 7);
  assert.equal(p.memorized, 0);
});

test('سور خارج المستوى وآيات خارج النطاق لا تؤثر', () => {
  const p = computeProgress([1], [rec(2, 1, 50), rec(1, 1, 999)], [rec(3, 1, 20)], scores);
  assert.equal(p.memorized, 7); // الفاتحة كاملة فقط (النطاق يُقصّ عند آخر آية)
  assert.equal(p.review.reviewed, 0);
});

test('بلا سجلات: صفر ونسبة صفر، وجميع سور القرآن تُحسب بإجمالي صحيح', () => {
  const all = SURAHS.map((s) => s.number);
  const p = computeProgress(all, [], [], scores);
  assert.equal(p.total, 6236);
  assert.equal(p.pct, 0);
  assert.equal(p.review.pct, 0);
});
