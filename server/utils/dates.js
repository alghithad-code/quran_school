const config = require('../config');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateStr = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

// تاريخ اليوم بتوقيت المجتمع بصيغة YYYY-MM-DD
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

// حدود اليوم بتوقيت المجتمع (الرياض) كلحظات UTC، لتصفية حقول createdAt بدقة
function tzOffsetMs(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}
const dayStart = (str) => { const g = Date.parse(str + 'T00:00:00Z'); return new Date(g - tzOffsetMs(g)); };
const dayEnd = (str) => new Date(dayStart(addDays(str, 1)).getTime() - 1);
// تاريخ لحظة معيّنة بتوقيت المجتمع بصيغة YYYY-MM-DD
const dateOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
// يحدد الفترة من ?month= أو ?from=&to=، وإلا الشهر الحالي
function resolvePeriod(q) {
  if (isDateStr(q.from) && isDateStr(q.to) && q.from <= q.to) {
    const min = addDays(q.to, -366); // حد أقصى سنة لحماية الخادم
    return { from: q.from < min ? min : q.from, to: q.to };
  }
  return monthRange(q.month) || monthRange(todayStr().slice(0, 7));
}

module.exports = { isDateStr, todayStr, addDays, weekday, monthRange, resolvePeriod, dayStart, dayEnd, dateOf };
