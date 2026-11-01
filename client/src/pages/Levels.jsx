import { useState } from 'react';
import { api } from '../api.js';
import { SURAHS } from '../quran.js';
import { SurahPicker } from '../surahPicker.jsx';
import { Empty, Icon, IconBtn, Loading, Modal, qs, summarizeSurahs, useFlash, useLoad } from '../ui.jsx';

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
      <div className="row between"><h2 className="h" style={{ margin: 0 }}>المستويات</h2><IconBtn icon="plus" tone="on" caption="مستوى" label="إضافة مستوى" disabled={!online} onClick={() => setForm({ name: '', description: '', surahs: [] })} /></div>
      <p className="small muted">الترتيب من الأدنى إلى الأعلى، والترقية تنقل الطالب للمستوى التالي. لكل مستوى سور تحددها يدوياً.</p>
      {flash.node}
      {data?.items.length === 0 && <Empty text="لم تُنشأ مستويات بعد" />}
      {data?.items.map((l, i) => (
        <div className="card item" key={l.id}>
          <div className="row between"><b>{i + 1}. {l.name}</b><a className="tag ok" href={'#/students' + qs({ levelId: l.id })}>{l.studentCount} طالب</a></div>
          <div className="small">{summarizeSurahs(l.surahs, SURAHS)}</div>
          {l.description && <div className="small muted">{l.description}</div>}
          <div className="small muted">المعلمون: {l.teachers.length ? l.teachers.map((t) => t.name).join('، ') : 'لا يوجد'}</div>
          <div className="irow">
            <IconBtn icon="arrowup" label="تقديم" disabled={!online || busy || i === 0} onClick={() => move(i, -1)} />
            <IconBtn icon="down" label="تأخير" disabled={!online || busy || i === data.items.length - 1} onClick={() => move(i, 1)} />
            <IconBtn icon="edit" label="تعديل" disabled={!online} onClick={() => setForm({ id: l.id, name: l.name, description: l.description, surahs: l.surahs || [] })} />
            <IconBtn icon="trash" tone="danger" label="حذف" disabled={!online || busy} onClick={() => del(l)} />
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
