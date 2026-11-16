// المصحف دون إنترنت: نص القرآن والتلاوات المحمّلة تُخزَّن في Cache API داخل المتصفح (على جهاز المستخدم فقط).
const TEXT = 'quran-text-v1';
const AUDIO = 'quran-audio-v1';
const META_URL = '/api/public/mushaf/meta';
const ALL_URL = '/api/public/mushaf/all';

const supported = () => typeof caches !== 'undefined';
const pad = (n) => String(n).padStart(3, '0');
export const audioUrl = (reader, s, a) => reader.urlTemplate.replace(/\{s\}/g, pad(s)).replace(/\{a\}/g, pad(a));

async function readCached(url) {
  if (!supported()) return null;
  try { const hit = await (await caches.open(TEXT)).match(url); return hit ? await hit.json() : null; } catch { return null; }
}
async function fetchAndStore(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('تعذّر التحميل');
  if (supported()) { try { (await caches.open(TEXT)).put(url, res.clone()); } catch { /* مساحة غير كافية */ } }
  return res.json();
}

// بيانات التنقل وقائمة القراء: من الخادم إن أمكن (وتُحفظ)، وإلا من آخر نسخة محفوظة
export async function loadMeta() {
  try { return await fetchAndStore(META_URL); } catch (e) {
    const c = await readCached(META_URL);
    if (c) return c;
    throw e;
  }
}

// نص القرآن كاملاً: يُحمَّل مرة واحدة (نحو 270 ك.ب) ويبقى للاستخدام دون إنترنت
let allText = null;
export async function loadAllText({ fetchIfMissing = true } = {}) {
  if (allText) return allText;
  allText = await readCached(ALL_URL);
  if (!allText && fetchIfMissing) allText = await fetchAndStore(ALL_URL);
  return allText;
}
export const hasOfflineText = async () => !!(allText || await readCached(ALL_URL));

export async function offlineSurah(n, names) {
  const all = await loadAllText({ fetchIfMissing: false });
  const ayahs = all?.surahs?.[n - 1];
  if (!ayahs) return null;
  const bas = all.basmalah;
  return { surah: n, name: names?.[n - 1]?.name || '', ayahs, basmalah: n !== 1 && ayahs[0].startsWith(bas) ? bas : null };
}

// بحث محلي بنفس تطبيع الخادم (إزالة التشكيل وتوحيد الحروف)
const norm = (t) => String(t || '')
  .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF\u06DE\u06E9]/g, '')
  .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ي').replace(/ة/g, 'ه')
  .replace(/ا/g, '').replace(/\s+/g, ' ').trim();
export async function offlineSearch(query, surahNames, limit = 30) {
  const nq = norm(query);
  if (nq.length < 2) return { surahs: [], ayahs: [] };
  const all = await loadAllText({ fetchIfMissing: false });
  if (!all) return null;
  const surahs = surahNames.map((s) => ({ surah: s.n, name: s.name, k: norm(s.name) })).filter((s) => s.k.includes(nq)).slice(0, 10).map(({ surah, name }) => ({ surah, name }));
  const ayahs = [];
  outer: for (let s = 0; s < all.surahs.length; s += 1) {
    for (let a = 0; a < all.surahs[s].length; a += 1) {
      const t = all.surahs[s][a];
      const body = a === 0 && s !== 0 && t.startsWith(all.basmalah) && t !== all.basmalah ? t.slice(all.basmalah.length) : t;
      if (norm(body).includes(nq)) { ayahs.push({ surah: s + 1, name: surahNames[s].name, ayah: a + 1, text: t }); if (ayahs.length >= limit) break outer; }
    }
  }
  return { surahs, ayahs };
}

// ---------- التلاوات المحمّلة ----------
export async function cachedAyahs(reader, surah, count) {
  if (!supported() || !reader) return 0;
  try {
    const c = await caches.open(AUDIO);
    const have = new Set((await c.keys()).map((r) => r.url));
    let n = 0;
    for (let a = 1; a <= count; a += 1) if (have.has(new URL(audioUrl(reader, surah, a), location.href).href)) n += 1;
    return n;
  } catch { return 0; }
}

// يعيد رابطاً قابلاً للتشغيل: نسخة محلية (blob) إن كانت محمّلة، وإلا الرابط الأصلي
export async function resolveAudio(url) {
  if (!supported()) return { src: url, blob: false };
  try {
    const hit = await (await caches.open(AUDIO)).match(url);
    if (hit) return { src: URL.createObjectURL(await hit.blob()), blob: true };
  } catch { /* يُبث من الشبكة */ }
  return { src: url, blob: false };
}

// تحميل سورة كاملة لقارئ معيّن (3 طلبات متوازية). يتخطى المحمّل مسبقاً، ويمكن إلغاؤه، ويعيد عدد الإخفاقات.
export async function downloadSurah(reader, surah, count, onProgress, signal) {
  if (!supported()) throw new Error('المتصفح لا يدعم التخزين دون إنترنت');
  try { await navigator.storage?.persist?.(); } catch { /* اختياري */ }
  const c = await caches.open(AUDIO);
  const have = new Set((await c.keys()).map((r) => r.url));
  const todo = [];
  for (let a = 1; a <= count; a += 1) { const u = audioUrl(reader, surah, a); if (!have.has(new URL(u, location.href).href)) todo.push(u); }
  let done = count - todo.length, failed = 0, first = true, i = 0;
  onProgress(done, count);
  async function worker() {
    while (i < todo.length && !signal.aborted) {
      const u = todo[i++];
      try {
        const res = await fetch(u, { mode: 'cors', signal });
        if (!res.ok) throw new Error('http ' + res.status);
        await c.put(u, res);
        done += 1; first = false;
      } catch (e) {
        if (signal.aborted) return;
        if (first && e instanceof TypeError) throw new Error('هذا القارئ لا يسمح بتحميل التلاوات للاستماع دون إنترنت. جرّب قارئاً آخر.');
        if (e.name === 'QuotaExceededError') throw new Error('لا توجد مساحة كافية على الجهاز.');
        failed += 1;
      }
      onProgress(done, count);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return { done, failed };
}

export async function deleteSurah(reader, surah, count) {
  if (!supported()) return;
  const c = await caches.open(AUDIO);
  for (let a = 1; a <= count; a += 1) await c.delete(audioUrl(reader, surah, a));
}
export async function deleteAllAudio() { if (supported()) await caches.delete(AUDIO); }

export async function audioUsage() {
  try {
    const est = await navigator.storage?.estimate?.();
    return est ? { usage: est.usage || 0, quota: est.quota || 0 } : null;
  } catch { return null; }
}
