// يطبّع أرقام الجوال إلى صيغة دولية بلا + (مثل 9665XXXXXXXX). يعيد '' إن كان فارغاً، وnull إن كانت الصيغة غير صحيحة.
// القواعد:
//  - يبدأ بـ 05 أو 5  → سعودي (966 تلقائياً)
//  - يبدأ بـ 07 أو 7  → يمني (967 تلقائياً)
//  - غير ذلك          → يُكتب الرقم مع مفتاح الدولة: +20… أو 0020… أو 20…
const PHONE_MESSAGE = 'رقم الجوال غير صحيح. سعودي: 05XXXXXXXX، يمني: 7XXXXXXXX، وللدول الأخرى اكتب الرقم مع مفتاح الدولة مثل +20…';

const SA = { code: '966', re: /^5\d{8}$/ };
const YE = { code: '967', re: /^7\d{8}$/ };

function normalizePhone(input) {
  if (!input) return '';
  let d = String(input).trim().replace(/[\s\-().]/g, '');
  // تحويل الأرقام العربية/الهندية إلى لاتينية
  d = d.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  const plus = d.startsWith('+');
  if (plus) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;

  const international = plus || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);

  // مفتاح دولة صريح (+ أو 00): نتحقق من السعودية واليمن بدقة، وغيرها بطول معياري E.164
  const withCode = (digits) => {
    for (const c of [SA, YE]) {
      if (digits.startsWith(c.code)) {
        const rest = digits.slice(c.code.length).replace(/^0/, ''); // 966 05… خطأ شائع
        return c.re.test(rest) ? c.code + rest : null;
      }
    }
    return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
  };
  if (international) return withCode(d);

  // محلي بلا مفتاح: السعودي 05/5 واليمني 07/7
  const local = d.replace(/^0/, '');
  if (SA.re.test(local)) return SA.code + local;
  if (YE.re.test(local)) return YE.code + local;
  // رقم مكتوب بمفتاح الدولة يدوياً بلا + (مثل 201012345678 أو 966501234567)
  if (!d.startsWith('0')) return withCode(d);
  return null;
}

function whatsappLink(phone) {
  return phone ? `https://wa.me/${phone}` : null;
}

// الاسم القديم يبقى للتوافق
module.exports = { normalizePhone, normalizeSaudiPhone: normalizePhone, whatsappLink, PHONE_MESSAGE };
