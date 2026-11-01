import { useMemo, useState } from 'react';
import { SURAHS } from './quran.js';

// اختيار السور يدوياً: بالضغط على كل سورة، أو بتحديد نطاق من سورة إلى سورة
export function SurahPicker({ value, onChange, taken }) {
  const [text, setText] = useState('');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const sel = new Set(value);
  const list = useMemo(() => SURAHS.filter((s) => !text.trim() || s.name.includes(text.trim()) || String(s.number) === text.trim()), [text]);
  const toggle = (n) => { const x = new Set(sel); x.has(n) ? x.delete(n) : x.add(n); onChange([...x].sort((a, b) => a - b)); };
  const addRange = (on) => {
    const [a, b] = [Math.min(from, to), Math.max(from, to)];
    const x = new Set(sel);
    for (let n = a; n <= b; n += 1) on ? x.add(n) : x.delete(n);
    onChange([...x].sort((p, q) => p - q));
  };
  return (
    <div>
      <div className="row"><b>المحدد: {value.length} سورة</b><button type="button" className="btn ghost sm" onClick={() => onChange([])}>مسح الكل</button></div>
      <div className="range">
        <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{SURAHS.map((s) => <option key={s.number} value={s.number}>{s.number}. {s.name}</option>)}</select>
        <span>إلى</span>
        <select value={to} onChange={(e) => setTo(Number(e.target.value))}>{SURAHS.map((s) => <option key={s.number} value={s.number}>{s.number}. {s.name}</option>)}</select>
      </div>
      <div className="row">
        <button type="button" className="btn ghost sm grow" onClick={() => addRange(true)}>+ تحديد النطاق</button>
        <button type="button" className="btn ghost sm grow" onClick={() => addRange(false)}>− إلغاء النطاق</button>
      </div>
      <input placeholder="ابحث عن سورة" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="surahs">
        {list.map((s) => (
          <button type="button" key={s.number} className={'sr' + (sel.has(s.number) ? ' on' : '')} onClick={() => toggle(s.number)}>
            <small>{s.number}</small>{s.name}
            {taken[s.number] && !sel.has(s.number) && <em>في: {taken[s.number]}</em>}
          </button>
        ))}
      </div>
    </div>
  );
}


