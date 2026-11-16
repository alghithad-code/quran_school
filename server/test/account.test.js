const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUsername, checkPasswordChange } = require('../utils/account');

test('اسم المستخدم: يُنظَّف ويُحوَّل لأحرف صغيرة', () => {
  assert.equal(normalizeUsername('  Ahmad.Ali_1 ').value, 'ahmad.ali_1');
});
test('اسم المستخدم: يُرفض القصير والرموز والعربي والمسافات', () => {
  for (const bad of [null, undefined, 'ab', 'أحمد123', 'a b c', 'user@x', 'x'.repeat(41), '']) assert.ok(normalizeUsername(bad).error, String(bad));
});
test('تغيير كلمة المرور: صحيح مع تأكيد مطابق', () => {
  assert.equal(checkPasswordChange({ currentPassword: 'old123', newPassword: 'new456', confirmPassword: 'new456' }), null);
});
test('تغيير كلمة المرور: يُرفض عند غياب الحالية أو ضعف الجديدة أو عدم تطابق التأكيد أو تطابقها مع الحالية', () => {
  assert.ok(checkPasswordChange({ newPassword: 'new456' }));
  assert.match(checkPasswordChange({ currentPassword: 'a', newPassword: 'short' }), /6 أحرف/);
  assert.match(checkPasswordChange({ currentPassword: 'a', newPassword: 'onlyletters' }), /أرقام/);
  assert.match(checkPasswordChange({ currentPassword: 'old123', newPassword: 'new456', confirmPassword: 'new457' }), /تأكيد/);
  assert.match(checkPasswordChange({ currentPassword: 'same123', newPassword: 'same123', confirmPassword: 'same123' }), /تختلف/);
});
test('تغيير كلمة المرور: التأكيد اختياري للتوافق مع الواجهات القديمة', () => {
  assert.equal(checkPasswordChange({ currentPassword: 'old123', newPassword: 'new456' }), null);
});
