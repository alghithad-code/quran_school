import { useState } from 'react';
import { api } from '../api.js';
import { Empty, Loading, Modal, go, qs, useFlash, useLoad } from '../ui.jsx';

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
    const { id, name, description, scope } = form;
    run(() => (id ? api('/levels/' + id, { method: 'PATCH', body: { name, description, scope } }) : api('/levels', { method: 'POST', body: { name, description, scope } })), id ? 'تم الحفظ' : 'تمت الإضافة');
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (loading) return <Loading />;
  return (
    <div>
      <div className="row between"><h2 className="h" style={{ margin: 0 }}>المستويات</h2><button className="btn" disabled={!online} onClick={() => setForm({ name: '', description: '', scope: '' })}>+ مستوى</button></div>
      <p className="small muted">الترتيب من الأدنى إلى الأعلى. الترقية تنقل الطالب للمستوى التالي في هذا الترتيب.</p>
      {flash.node}
      {data?.items.length === 0 && <Empty text="لم تُنشأ مستويات بعد" />}
      {data?.items.map((l, i) => (
        <div className="card item" key={l.id}>
          <div className="row between"><b>{i + 1}. {l.name}</b><a className="tag ok" href={'#/students' + qs({ levelId: l.id })}>{l.studentCount} طالب</a></div>
          {l.scope && <div className="small">النطاق: {l.scope}</div>}
          {l.description && <div className="small muted">{l.description}</div>}
          <div className="small muted">المعلمون: {l.teachers.length ? l.teachers.map((t) => t.name).join('، ') : 'لا يوجد'}</div>
          <div className="row wrap" style={{ marginBottom: 0 }}>
            <button className="btn ghost sm" disabled={!online || busy || i === 0} onClick={() => move(i, -1)}>▲</button>
            <button className="btn ghost sm" disabled={!online || busy || i === data.items.length - 1} onClick={() => move(i, 1)}>▼</button>
            <button className="btn ghost" disabled={!online} onClick={() => setForm({ id: l.id, name: l.name, description: l.description, scope: l.scope })}>تعديل</button>
            <button className="btn ghost danger" disabled={!online || busy} onClick={() => del(l)}>حذف</button>
          </div>
        </div>
      ))}
      {data?.unassigned > 0 && <a className="card line" href="#/students?levelId=none"><span>طلاب بلا مستوى</span><b>{data.unassigned}</b></a>}
      {form && (
        <Modal title={form.id ? 'تعديل المستوى' : 'مستوى جديد'} onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            <label>الاسم<input value={form.name} onChange={set('name')} required /></label>
            <label>نطاق الحفظ (مثال: جزء عمّ)<input value={form.scope} onChange={set('scope')} /></label>
            <label>وصف<input value={form.description} onChange={set('description')} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
