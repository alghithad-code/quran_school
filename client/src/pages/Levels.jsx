import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { SURAHS } from '../quran.js';
import { Empty, Icon, Loading, Modal, qs, summarizeSurahs, useFlash, useLoad } from '../ui.jsx';

// اختيار السور يدوياً: بالضغط على كل سورة، أو بتحديد نطاق من سورة إلى سورة
function SurahPicker({ value, onChange, taken }) {
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

export default function Levels({ online }) {
  const { data, loading, reload } = useLoad(() => api('/levels'), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  async function run(fn, ok) {
    setBusy(true); flash.clear();
    try { await fn(); flash.ok(ok); setForm(null); await reload(); } catch (e) { flash.err(e); } finally { setBusy(false); }
  }
  const move = (i, d) => {
    const ids = data.items.map((l) => l.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => api('/levels/reorder', { method: 'POST', body: { ids } }), 'تم الترتيب');
  };
  const del = (l) => { if (confirm(`حذف المستوى «${l.name}»؟`)) run(() => api('/levels/' + l.id, { method: 'DELETE' }), 'تم الحذف'); };
  const submit = (e) => {
    e.preventDefault();
    const { id, name, description, surahs } = form;
    const body = { name, description, surahs };
    run(() => (id ? api('/levels/' + id, { method: 'PATCH', body }) : api('/levels', { method: 'POST', body })), id ? 'تم الحفظ' : 'تمت الإضافة');
  };
  // السور المستخدمة في مستويات أخرى (للتنبيه فقط، ولا يمنع التكرار)
  const taken = {};
  (data?.items || []).filter((l) => l.id !== form?.id).forEach((l) => (l.surahs || []).forEach((n) => { taken[n] = taken[n] ? `${taken[n]}، ${l.name}` : l.name; }));

  if (loading) return <Loading />;
  return (
    <div>
      <div className="row between"><h2 className="h" style={{ margin: 0 }}>المستويات</h2><button className="btn" disabled={!online} onClick={() => setForm({ name: '', description: '', surahs: [] })}><Icon name="plus" size={18} /> مستوى</button></div>
      <p className="small muted">الترتيب من الأدنى إلى الأعلى، والترقية تنقل الطالب للمستوى التالي. لكل مستوى سور تحددها يدوياً.</p>
      {flash.node}
      {data?.items.length === 0 && <Empty text="لم تُنشأ مستويات بعد" />}
      {data?.items.map((l, i) => (
        <div className="card item" key={l.id}>
          <div className="row between"><b>{i + 1}. {l.name}</b><a className="tag ok" href={'#/students' + qs({ levelId: l.id })}>{l.studentCount} طالب</a></div>
          <div className="small">{summarizeSurahs(l.surahs, SURAHS)}</div>
          {l.description && <div className="small muted">{l.description}</div>}
          <div className="small muted">المعلمون: {l.teachers.length ? l.teachers.map((t) => t.name).join('، ') : 'لا يوجد'}</div>
          <div className="row wrap" style={{ marginBottom: 0 }}>
            <button className="btn ghost sm" disabled={!online || busy || i === 0} onClick={() => move(i, -1)}>▲</button>
            <button className="btn ghost sm" disabled={!online || busy || i === data.items.length - 1} onClick={() => move(i, 1)}>▼</button>
            <button className="btn ghost" disabled={!online} onClick={() => setForm({ id: l.id, name: l.name, description: l.description, surahs: l.surahs || [] })}>تعديل</button>
            <button className="btn ghost danger" disabled={!online || busy} onClick={() => del(l)}>حذف</button>
          </div>
        </div>
      ))}
      {data?.unassigned > 0 && <a className="card line" href="#/students?levelId=none"><span>طلاب بلا مستوى</span><b>{data.unassigned}</b></a>}
      {form && (
        <Modal title={form.id ? 'تعديل المستوى' : 'مستوى جديد'} onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            <label>الاسم<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>وصف (اختياري)<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <h3>سور هذا المستوى</h3>
            <SurahPicker value={form.surahs} onChange={(surahs) => setForm({ ...form, surahs })} taken={taken} />
            <button className="btn block" disabled={busy} style={{ marginTop: 12 }}>حفظ</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
