// يطبّع الأرقام السعودية إلى 9665XXXXXXXX. يعيد null إذا كانت الصيغة غير صحيحة.
function normalizeSaudiPhone(input) {
  if (!input) return '';
  let d = String(input).replace(/[\s\-()+]/g, '');
  // تحويل الأرقام العربية/الهندية إلى لاتينية
  d = d.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('966')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^5\d{8}$/.test(d)) return null;
  return '966' + d;
}

function whatsappLink(phone) {
  return phone ? `https://wa.me/${phone}` : null;
}

module.exports = { normalizeSaudiPhone, whatsappLink };
