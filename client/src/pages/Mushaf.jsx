import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, Loading, Modal } from '../ui.jsx';

// المصحف الشريف: مكوّن واحد يُستخدم للزائر (من شاشة الدخول) وللمستخدم المسجل (من القائمة الجانبية).
// الزائر: يُحفظ موضعه وقارئه على جهازه فقط. المسجل: يُحفظ في حسابه ويُسترجع من أي جهاز، مع نسخة محلية تُزامَن عند عودة الاتصال.

const LS = 'mushaf.v1';
const ar = (n) => Number(n).toLocaleString('ar-EG');
const pad = (n) => String(n).padStart(3, '0');
const key = (s, a) => s * 1000 + a;
const surahCache = new Map();
let metaCache = null;

const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch { return {}; } };
const writeLocal = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* ممتلئ أو ممنوع */ } };

const urlFor = (reader, s, a) => reader.urlTemplate.replace(/\{s\}/g, pad(s)).replace(/\{a\}/g, pad(a));
const juzOf = (juz, s, a) => { let n = 1; for (let i = 0; i < juz.length; i += 1) { if (key(juz[i][0], juz[i][1]) <= key(s, a)) n = i + 1; else break; } return n; };
const pageOf = (pages, s, a) => {
  if (!pages) return null;
  let lo = 0, hi = pages.length - 1, ans = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (key(pages[m][0], pages[m][1]) <= key(s, a)) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans + 1;
};

// خطة التشغيل: مقطع من آية إلى آية، كل آية تتكرر each مرة، والمقطع يتكرر seg مرة (0 = بلا نهاية). تُحسب الخطوات عند الطلب.
const stepsIn = (p) => (p.to - p.from + 1) * p.each;
const totalSteps = (p) => (p.seg === 0 ? Infinity : stepsIn(p) * p.seg);
const ayahAt = (p, i) => p.from + Math.floor((i % stepsIn(p)) / p.each);

const EACH = [1, 2, 3, 5, 7, 10, 15, 20];
const SEG = [1, 2, 3, 5, 10, 20, 50, 0];
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function Mushaf({ authed = false, online = true }) {
  const init = useRef(readLocal()).current;
  const [meta, setMeta] = useState(metaCache);
  const [err, setErr] = useState('');
  const [surah, setSurah] = useState(init.surah || 1);
  const [cur, setCur] = useState(init.ayah || 1); // آخر آية وصل إليها القارئ
  const [sel, setSel] = useState(null); // آية محددة بالنقر
  const [data, setData] = useState(surahCache.get(init.surah || 1) || null);
  const [readerId, setReaderId] = useState(init.readerId || '');
  const [fontSize, setFontSize] = useState(init.fontSize || 28);
  const [speed, setSpeed] = useState(init.speed || 1);
  const [vol, setVol] = useState(init.vol ?? 1);
  const [hide, setHide] = useState(!!init.hide);
  const [shown, setShown] = useState(() => new Set());
  const [panel, setPanel] = useState('');
  const [synced, setSynced] = useState(!authed);
  // أدوات الحفظ
  const [segFrom, setSegFrom] = useState(1);
  const [segTo, setSegTo] = useState(1);
  const [each, setEach] = useState(1);
  const [seg, setSeg] = useState(1);
  // الصوت
  const [now, setNow] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ t: 0, d: 0 });
  // البحث والانتقال
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [goTo, setGoTo] = useState('');
  const [ctl, setCtl] = useState(false); // لوحة التحكم (نافذة سفلية)
  const [topH, setTopH] = useState(64); // ارتفاع شريط الصفحة العلوي لتثبيت شريط المصحف تحته

  // في وضع المصحف يختفي الشريط السفلي للتطبيق ويستقر شريط التشغيل في أسفل الشاشة (القائمة الجانبية تبقى من زر القائمة)
  useEffect(() => { document.body.classList.add('mushaf-open'); return () => document.body.classList.remove('mushaf-open'); }, []);

  const audio = useRef(null);
  const plan = useRef(null);
  const touched = useRef(false);
  const pendingJump = useRef(init.ayah > 1 ? init.ayah : null);
  const dirty = useRef(false);
  const saveTimer = useRef();

  const readers = meta?.readers || [];
  const reader = readers.find((r) => r.id === readerId) || readers[0] || null;
  const live = useRef({});
  live.current = { reader, speed, vol };
  const ays = data?.ayahs.length || 0;
  const nameOf = (n) => meta?.surahs[n - 1]?.name || '';

  // ---------- البيانات ----------
  useEffect(() => {
    if (metaCache) return;
    api('/public/mushaf/meta').then((m) => { metaCache = m; setMeta(m); }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    setShown(new Set()); setSel(null);
    if (surahCache.has(surah)) { setData(surahCache.get(surah)); return; }
    setData(null);
    api('/public/mushaf/surah/' + surah).then((r) => { surahCache.set(surah, r); setData(r); }).catch((e) => setErr(e.message));
  }, [surah]);

  useEffect(() => { if (ays) { setSegFrom(1); setSegTo(ays); } }, [ays, surah]);

  const scrollToAyah = useCallback((a) => {
    requestAnimationFrame(() => {
      const el = a > 1 ? document.getElementById('ay-' + a) : null;
      if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 140) });
      else window.scrollTo({ top: 0 });
    });
  }, []);

  // بعد تحميل السورة: الانتقال إلى الآية المطلوبة (استئناف القراءة أو الانتقال المباشر)
  useEffect(() => {
    if (!data || data.surah !== surah || pendingJump.current === null) return;
    const a = pendingJump.current;
    pendingJump.current = null;
    scrollToAyah(a);
  }, [data, surah, scrollToAyah]);

  function jump(s, a = 1) {
    touched.current = true;
    setCur(a);
    if (s === surah) scrollToAyah(a);
    else { pendingJump.current = a; setSurah(s); }
  }

  const go = (s2, a = 1) => { setCtl(false); jump(s2, a); }; // انتقال من لوحة التحكم: يغلقها ثم ينتقل

  // تتبّع آخر آية وصل إليها القارئ أثناء التمرير
  useEffect(() => {
    let t;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        for (const el of document.querySelectorAll('.mtext .ay')) {
          if (el.getBoundingClientRect().bottom > 150) { const n = Number(el.dataset.n); if (n) setCur(n); break; }
        }
      }, 250);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const measure = () => { const h = document.querySelector('.top'); if (h) setTopH(Math.max(0, Math.round(h.getBoundingClientRect().height) - 1)); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ---------- الحفظ: محلي دائماً، وفي حساب المستخدم المسجل ----------
  const flush = useCallback(async () => {
    if (!authed || !dirty.current || !navigator.onLine) return;
    const st = readLocal();
    if (!st.surah) return;
    try {
      await api('/mushaf/progress', { method: 'PUT', body: { surah: st.surah, ayah: st.ayah, readerId: st.readerId || null, fontSize: st.fontSize, speed: st.speed, hide: !!st.hide } });
      dirty.current = false;
    } catch { /* يبقى محلياً ويُزامَن عند عودة الاتصال */ }
  }, [authed]);

  // استرجاع موضع المستخدم المسجل من حسابه (إن كان أحدث من المحفوظ على هذا الجهاز)
  useEffect(() => {
    if (!authed) return;
    if (!online) { setSynced(true); return; }
    api('/mushaf/progress').then(({ progress: p }) => {
      if (!p) { dirty.current = true; return; }
      if (!touched.current && new Date(p.updatedAt).getTime() > (init.t || 0)) {
        pendingJump.current = p.ayah > 1 ? p.ayah : null;
        setCur(p.ayah); setSurah(p.surah);
        if (p.readerId) setReaderId(p.readerId);
        if (p.fontSize) setFontSize(p.fontSize);
        if (p.speed) setSpeed(p.speed);
        setHide(!!p.hide);
      } else dirty.current = true;
    }).catch(() => { dirty.current = true; }).finally(() => setSynced(true));
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  const effReader = reader?.id || '';
  useEffect(() => {
    if (!synced) return undefined;
    writeLocal({ surah, ayah: cur, readerId: effReader, fontSize, speed, vol, hide, t: Date.now() });
    if (!authed) return undefined;
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [synced, surah, cur, effReader, fontSize, speed, vol, hide, authed, flush]);

  useEffect(() => { if (online) flush(); }, [online, flush]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); flush(); };
  }, [flush]);

  // ---------- الصوت ----------
  function failPlay() {
    setErr('تعذّر تشغيل التلاوة. قد يكون مصدر الصوت غير متاح لهذا القارئ أو لا يوجد اتصال بالإنترنت. جرّب قارئاً آخر.');
    plan.current = null; setNow(null); setPlaying(false);
  }
  function finish() { plan.current = null; setNow(null); setPlaying(false); }

  function playStep() {
    const p = plan.current, L = live.current, a = audio.current;
    if (!p || !L.reader || !a) return;
    if (p.i >= totalSteps(p)) { finish(); return; }
    const ay = ayahAt(p, p.i);
    const url = urlFor(L.reader, p.surah, ay);
    setNow({ surah: p.surah, ayah: ay });
    a.defaultPlaybackRate = L.speed;
    a.volume = L.vol;
    if (a.src === url) a.currentTime = 0; else a.src = url;
    a.playbackRate = L.speed;
    const pr = a.play();
    if (pr && pr.catch) pr.catch((e) => { if (e.name !== 'AbortError') failPlay(); });
    // تحميل مسبق للآية التالية لتقليل الفاصل
    const nextI = p.i + 1;
    if (nextI < totalSteps(p)) {
      const nAy = ayahAt(p, nextI);
      if (nAy !== ay) { const pre = new Audio(); pre.preload = 'auto'; pre.src = urlFor(L.reader, p.surah, nAy); }
    }
  }
  function startPlan(p) { setErr(''); plan.current = { ...p, i: 0 }; playStep(); }
  const onEnded = () => { if (plan.current) { plan.current.i += 1; playStep(); } };
  const onError = () => { if (plan.current) failPlay(); };
  const onTime = () => { const a = audio.current; if (a) setTime({ t: a.currentTime || 0, d: Number.isFinite(a.duration) ? a.duration : 0 }); };

  function toggle() {
    const a = audio.current;
    if (plan.current && a.src) { if (a.paused) a.play().catch(failPlay); else a.pause(); return; }
    if (!ays) return;
    startPlan({ surah, from: sel || cur, to: ays, each, seg });
  }
  function skip(d) {
    const p = plan.current;
    if (!p) return;
    p.i = Math.max(0, (Math.floor(p.i / p.each) + d) * p.each);
    playStep();
  }
  function stop() { const a = audio.current; if (a) a.pause(); plan.current = null; setNow(null); setPlaying(false); setTime({ t: 0, d: 0 }); }
  const playSegment = () => { if (segTo < segFrom) { setErr('آية النهاية يجب أن تكون بعد آية البداية'); return; } setCtl(false); startPlan({ surah, from: segFrom, to: segTo, each, seg }); };
  const playAyah = () => { const a = sel || cur; setCtl(false); startPlan({ surah, from: a, to: a, each, seg }); };
  const playWhole = () => { setCtl(false); startPlan({ surah, from: 1, to: ays, each: 1, seg: 1 }); };

  useEffect(() => { const a = audio.current; if (a) { a.volume = vol; a.playbackRate = speed; a.defaultPlaybackRate = speed; } }, [vol, speed]);
  useEffect(() => () => { const a = audio.current; if (a) { a.pause(); a.removeAttribute('src'); } plan.current = null; }, []);

  // متابعة الآية الجارية: تظليل وتمرير
  useEffect(() => {
    if (!now) return;
    if (now.surah === surah) {
      setCur(now.ayah);
      document.getElementById('ay-' + now.ayah)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- التنقل ----------
  const pages = meta?.pages || null;
  const juzNo = meta ? juzOf(meta.juz, surah, cur) : null;
  const pageNo = meta ? pageOf(pages, surah, cur) : null;
  function step(d) {
    if (pages) {
      const p = Math.min(604, Math.max(1, pageNo + d));
      const [s, a] = pages[p - 1];
      jump(s, a);
    } else {
      const s = surah + d;
      if (s >= 1 && s <= 114) jump(s, 1);
    }
  }
  const atStart = pages ? pageNo <= 1 : surah <= 1;
  const atEnd = pages ? pageNo >= 604 : surah >= 114;

  async function doSearch(e) {
    e.preventDefault();
    if (q.trim().length < 2) { setErr('اكتب حرفين على الأقل للبحث'); return; }
    setBusy(true); setErr('');
    try { setRes(await api('/public/mushaf/search?q=' + encodeURIComponent(q.trim()))); } catch (er) { setErr(er.message); } finally { setBusy(false); }
  }
  function doGo(e) {
    e.preventDefault();
    const a = Number(goTo);
    if (!Number.isInteger(a) || a < 1 || a > ays) { setErr(`رقم الآية بين 1 و${ays}`); return; }
    setErr(''); go(surah, a); setGoTo('');
  }

  const playingAyah = now && now.surah === surah ? now.ayah : null;
  const text = useMemo(() => data && (
    <div className="quran" dir="rtl" style={{ fontSize }}>
      {data.basmalah && <div className="qbis">{data.basmalah}</div>}
      {data.ayahs.map((t, i) => {
        const n = i + 1;
        const hid = hide && !shown.has(n);
        return (
          <span key={n} id={'ay-' + n} data-n={n} className={'ay' + (sel === n ? ' sel' : '') + (playingAyah === n ? ' play' : '') + (hid ? ' hid' : '')}
            onClick={() => { setSel(n); if (hide) setShown((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; }); }}>
            <span className="at">{i === 0 && data.basmalah ? t.slice(data.basmalah.length).trim() : t}</span>
            <span className="qnum">﴿{ar(n)}﴾</span>{' '}
          </span>
        );
      })}
    </div>
  ), [data, hide, shown, sel, playingAyah, fontSize]);

  if (!meta) return err ? <div className="alert">{err} <button className="btn ghost sm" onClick={() => { setErr(''); api('/public/mushaf/meta').then((m) => { metaCache = m; setMeta(m); }).catch((e) => setErr(e.message)); }}>إعادة المحاولة</button></div> : <Loading />;

  const host = reader ? (() => { try { return new URL(reader.urlTemplate.replace(/\{[sa]\}/g, '001')).hostname; } catch { return ''; } })() : '';

  return (
    <div className="mush">
      <div className="mbar" style={{ top: topH }}>
        <div className="mbar-info">
          <b>سورة {nameOf(surah)}</b>
          <span>الجزء {ar(juzNo)}{pageNo ? ` · الصفحة ${ar(pageNo)}` : ''} · الآية {ar(cur)} من {ar(ays)}</span>
        </div>
        <button type="button" className="btn sm" onClick={() => setCtl(true)}><Icon name="sliders" size={20} /> التحكم</button>
      </div>

      {ctl && (
        <Modal title="لوحة التحكم" onClose={() => setCtl(false)}>
          <div className="mtools">
            {err && <div className="alert" onClick={() => setErr('')}>{err}</div>}
        <div className="mgrid">
          <label>السورة
            <select value={surah} onChange={(e) => go(Number(e.target.value), 1)}>
              {meta.surahs.map((s) => <option key={s.n} value={s.n}>{s.n}. {s.name}</option>)}
            </select>
          </label>
          <label>الجزء
            <select value={juzNo} onChange={(e) => { const [s, a] = meta.juz[Number(e.target.value) - 1]; go(s, a); }}>
              {meta.juz.map((_, i) => <option key={i} value={i + 1}>الجزء {ar(i + 1)}</option>)}
            </select>
          </label>
          <label>القارئ
            <select value={reader?.id || ''} onChange={(e) => setReaderId(e.target.value)} disabled={!readers.length}>
              {!readers.length && <option value="">لا يوجد قراء</option>}
              {readers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>سرعة التلاوة
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((v) => <option key={v} value={v}>{v === 1 ? 'عادية' : `×${v}`}</option>)}
            </select>
          </label>
        </div>
        <form className="row" onSubmit={doGo} style={{ marginBottom: 0 }}>
          <input className="grow" type="number" inputMode="numeric" min="1" max={ays || undefined} placeholder={`اذهب إلى آية (1–${ays || ''})`} value={goTo} onChange={(e) => setGoTo(e.target.value)} />
          <button className="btn ghost">اذهب</button>
        </form>
        <div className="irow">
          <button type="button" className={'ibtn wide' + (panel === 'search' ? ' on' : '')} onClick={() => setPanel(panel === 'search' ? '' : 'search')}><Icon name="search" size={20} /><span>بحث</span></button>
          <button type="button" className={'ibtn wide' + (panel === 'tools' ? ' on' : '')} onClick={() => setPanel(panel === 'tools' ? '' : 'tools')}><Icon name="sliders" size={20} /><span>أدوات الحفظ</span></button>
          <button type="button" className="ibtn" aria-label="تصغير الخط" onClick={() => setFontSize((v) => Math.max(18, v - 2))}>أ−</button>
          <button type="button" className="ibtn" aria-label="تكبير الخط" onClick={() => setFontSize((v) => Math.min(48, v + 2))}>أ+</button>
        </div>

        {panel === 'search' && (
          <div className="mpanel">
            <form className="row" onSubmit={doSearch} style={{ marginBottom: 8 }}>
              <input className="grow" placeholder="اسم سورة أو نص آية" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn" disabled={busy || !online}>{busy ? '…' : 'بحث'}</button>
            </form>
            {res && !res.surahs.length && !res.ayahs.length && <p className="muted small">لا توجد نتائج</p>}
            {res?.surahs.length > 0 && <div className="chips">{res.surahs.map((s) => <button key={s.surah} className="chip" onClick={() => { go(s.surah, 1); setPanel(''); }}>سورة {s.name}</button>)}</div>}
            {res?.ayahs.map((a) => (
              <button key={a.surah + ':' + a.ayah} className="line" onClick={() => { go(a.surah, a.ayah); setPanel(''); }}>
                <span className="qsnip" dir="rtl">{a.text.length > 90 ? a.text.slice(0, 90) + '…' : a.text}</span>
                <small className="muted">{a.name} · {ar(a.ayah)}</small>
              </button>
            ))}
            {res?.ayahs.length >= 30 && <p className="muted small">عُرضت أول 30 نتيجة، دقّق البحث لنتائج أقل.</p>}
          </div>
        )}

        {panel === 'tools' && (
          <div className="mpanel">
            <label className="check"><input type="checkbox" checked={hide} onChange={(e) => { setHide(e.target.checked); setShown(new Set()); }} />إخفاء الآيات للتسميع (اضغط الآية لإظهارها)</label>
            {hide && <button className="btn ghost sm" onClick={() => setShown(new Set(Array.from({ length: ays }, (_, i) => i + 1)))}>إظهار الكل</button>}
            <h3 style={{ marginTop: 12 }}>تحديد المقطع وتكراره</h3>
            <div className="mgrid">
              <label>من آية<select value={segFrom} onChange={(e) => setSegFrom(Number(e.target.value))}>{Array.from({ length: ays }, (_, i) => <option key={i} value={i + 1}>{ar(i + 1)}</option>)}</select></label>
              <label>إلى آية<select value={segTo} onChange={(e) => setSegTo(Number(e.target.value))}>{Array.from({ length: ays }, (_, i) => <option key={i} value={i + 1}>{ar(i + 1)}</option>)}</select></label>
              <label>تكرار كل آية<select value={each} onChange={(e) => setEach(Number(e.target.value))}>{EACH.map((n) => <option key={n} value={n}>{ar(n)} {n === 1 ? 'مرة' : 'مرات'}</option>)}</select></label>
              <label>تكرار المقطع<select value={seg} onChange={(e) => setSeg(Number(e.target.value))}>{SEG.map((n) => <option key={n} value={n}>{n === 0 ? 'بلا نهاية' : `${ar(n)} ${n === 1 ? 'مرة' : 'مرات'}`}</option>)}</select></label>
            </div>
            <div className="irow">
              <button className="btn" disabled={!reader} onClick={playSegment}>تشغيل المقطع</button>
              <button className="btn ghost" disabled={!reader} onClick={playAyah}>تشغيل الآية {ar(sel || cur)}</button>
              <button className="btn ghost" disabled={!reader} onClick={playWhole}>تشغيل السورة كاملة</button>
            </div>
            <p className="muted small">لا ينتقل التشغيل لآية أخرى قبل انتهاء المقطع المحدد وتكراره. السرعة تطبّقها المتصفح على التلاوة.</p>
          </div>
        )}
          </div>
        </Modal>
      )}

      {!ctl && err && <div className="alert" onClick={() => setErr('')}>{err}</div>}

      <div className="mtext">{data ? text : <Loading />}</div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn ghost grow" disabled={atStart} onClick={() => step(-1)}>{pages ? 'الصفحة السابقة' : 'السورة السابقة'}</button>
        <button className="btn ghost grow" disabled={atEnd} onClick={() => step(1)}>{pages ? 'الصفحة التالية' : 'السورة التالية'}</button>
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>
        نص القرآن: <a href={meta.source.url} target="_blank" rel="noreferrer">{meta.source.name}</a>
        {host && <> · التلاوات: بث من {host}</>}
      </p>

      <div className={'mplayer' + (authed ? ' authed' : '')}>
        <audio ref={audio} preload="auto" onEnded={onEnded} onError={onError} onTimeUpdate={onTime} onLoadedMetadata={onTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        <div className="mnow small">
          {now ? `${reader?.name || ''} · سورة ${nameOf(now.surah)} · الآية ${ar(now.ayah)}` : reader ? `القارئ: ${reader.name} — اضغط تشغيل للاستماع من الآية ${ar(sel || cur)}` : 'لا يوجد قراء مفعّلون حالياً'}
        </div>
        <div className="mctl">
          <button type="button" className="ibtn" aria-label="الآية السابقة" disabled={!now} onClick={() => skip(-1)}><Icon name="chevR" size={22} /></button>
          <button type="button" className="ibtn on" aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'} disabled={!reader} onClick={toggle}><Icon name={playing ? 'pause' : 'play'} size={22} /></button>
          <button type="button" className="ibtn" aria-label="الآية التالية" disabled={!now} onClick={() => skip(1)}><Icon name="chevL" size={22} /></button>
          <button type="button" className="ibtn" aria-label="إيقاف" disabled={!now} onClick={stop}><Icon name="stop" size={20} /></button>
          <input type="range" aria-label="التقديم والتأخير" min="0" max={time.d || 1} step="0.1" value={Math.min(time.t, time.d || 1)} disabled={!now} onChange={(e) => { const a = audio.current; if (a) a.currentTime = Number(e.target.value); }} />
          <span className="mvol"><Icon name="volume" size={20} /><input type="range" aria-label="مستوى الصوت" min="0" max="1" step="0.05" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></span>
        </div>
      </div>
    </div>
  );
}

// الواجهة العامة للزائر: بلا تسجيل دخول ولا جلسة، ولا وصول لأي بيانات داخلية
export function PublicMushaf({ online }) {
  return (
    <div>
      <header className="top">
        <a className="iconbtn" href="#/" aria-label="العودة لتسجيل الدخول"><Icon name="chevR" /></a>
        <div className="title">المصحف الشريف</div>
        <a className="btn ghost sm" href="#/">تسجيل الدخول</a>
      </header>
      {!online && <div className="offline">لا يوجد اتصال بالإنترنت</div>}
      <main className="content"><Mushaf authed={false} online={online} /></main>
    </div>
  );
}
