const config = require('../config');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateStr = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

// تاريخ اليوم بتوقيت المدرسة بصيغة YYYY-MM-DD
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(str, n) {
  const d = new Date(str + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// 0 = الأحد ... 6 = السبت
const weekday = (str) => new Date(str + 'T00:00:00Z').getUTCDay();

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
// يحدد الفترة من ?month= أو ?from=&to=، وإلا الشهر الحالي
function resolvePeriod(q) {
  if (isDateStr(q.from) && isDateStr(q.to) && q.from <= q.to) return { from: q.from, to: q.to };
  return monthRange(q.month) || monthRange(todayStr().slice(0, 7));
}

module.exports = { isDateStr, todayStr, addDays, weekday, monthRange, resolvePeriod };
