import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Loading, Modal } from './ui.jsx';

const cache = new Map();
const ar = (n) => n.toLocaleString('ar-EG'); // أرقام الآيات بالهندية

// نافذة قراءة سورة. النص من ملف تنزيل كما هو دون تعديل.
// ranges: آيات للتظليل [[من، إلى]]، legend: شرح التظليل. تتمرر النافذة إلى أول آية مظللة.
export function QuranReader({ surah, ranges = [], legend = '', onClose }) {
  const [d, setD] = useState(cache.get(surah) || null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (cache.has(surah)) { setD(cache.get(surah)); return; }
    setD(null); setErr('');
    api('/quran/' + surah).then((r) => { cache.set(surah, r); setD(r); }).catch((e) => setErr(e.message));
  }, [surah]);

  const hl = (n) => ranges.some(([a, b]) => n >= a && n <= b);
  const first = ranges.length ? Math.min(...ranges.map((r) => r[0])) : null;
  useEffect(() => {
    if (d && first) document.getElementById('ay-' + first)?.scrollIntoView({ block: 'center' });
  }, [d, first]);

  return (
    <Modal title={d ? `سورة ${d.name}` : 'القراءة'} onClose={onClose}>
      {err && <div className="alert">{err}</div>}
      {!d && !err && <Loading />}
      {d && (
        <>
          {legend && ranges.length > 0 && <p className="small"><span className="ay hl">المظلَّل</span> {legend}</p>}
          <div className="quran" dir="rtl">
            {d.basmalah && <div className="qbis">{d.basmalah}</div>}
            {d.ayahs.map((t, i) => (
              <span key={i} id={'ay-' + (i + 1)} className={'ay' + (hl(i + 1) ? ' hl' : '')}>
                {i === 0 && d.basmalah ? t.slice(d.basmalah.length).trim() : t}
                <span className="qnum">﴿{ar(i + 1)}﴾</span>{' '}
              </span>
            ))}
          </div>
          <p className="small muted" style={{ textAlign: 'center' }}>
            نص القرآن: مشروع <a href="https://tanzil.net" target="_blank" rel="noreferrer">تنزيل (tanzil.net)</a>
          </p>
        </>
      )}
    </Modal>
  );
}
