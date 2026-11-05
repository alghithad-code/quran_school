import { useState } from 'react';
import { api } from '../api.js';
import { Empty, Icon, IconBtn, Loading, Modal, useFlash, useLoad } from '../ui.jsx';

// نموذج اسم المجموعة (إنشاء/تعديل)
export function GroupForm({ initial, onSaved, onClose }) {
  const [name, setName] = useState(initial.name || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = initial.id ? await api('/groups/' + initial.id, { method: 'PATCH', body: { name } }) : await api('/groups', { method: 'POST', body: { name } });
      onSaved(r.group, !initial.id);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial.id ? 'تعديل المجموعة' : 'مجموعة جديدة'} onClose={onClose}>
      <form onSubmit={submit}>
        <label>اسم المجموعة<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="مثال: أولياء أمور حلقة الفجر" /></label>
        {err && <div className="alert">{err}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
      </form>
    </Modal>
  );
}

export default function Groups({ online }) {
  const { data, loading, reload } = useLoad(() => api('/groups'), []);
  const [form, setForm] = useState(null);
  const flash = useFlash();

  async function del(g) {
    if (!confirm(`حذف المجموعة «${g.name}» وسجل رسائلها؟ لا تُحذف أي بيانات للطلاب.`)) return;
    try { await api('/groups/' + g.id, { method: 'DELETE' }); flash.ok('تم حذف المجموعة'); reload(); } catch (e) { flash.err(e); }
  }

  if (loading) return <Loading />;
  return (
    <div>
      <div className="row between">
        <h2 className="h" style={{ margin: 0 }}>المجموعات</h2>
        <IconBtn icon="plus" tone="on" caption="مجموعة" label="إضافة مجموعة" disabled={!online} onClick={() => setForm({ name: '' })} />
      </div>
      <p className="small muted">مجموعات لإرسال رسائل واتساب لأعضائها دفعة واحدة. اكتب الرسالة ثم افتحها لكل عضو بضغطة.</p>
      {flash.node}
      {data?.items.length === 0 && <Empty text="لم تُنشأ مجموعات بعد" />}
      {data?.items.map((g) => (
        <div className="card tcard" key={g.id}>
          <div className="sc-head">
            <div className="avatar"><Icon name="grid" size={22} /></div>
            <a className="name" href={'#/groups/' + g.id}>{g.name}</a>
          </div>
          <div className="metas">
            <span className="m"><Icon name="users" size={14} />{g.studentCount} طالب</span>
            <span className="m"><Icon name="chat" size={14} />{g.withPhone} لديهم رقم</span>
            {g.studentCount > g.withPhone && <span className="tag warn">{g.studentCount - g.withPhone} بلا رقم</span>}
          </div>
          <div className="irow">
            <IconBtn icon="chat" tone="wa" caption="رسالة" label="كتابة رسالة للمجموعة" href={'#/groups/' + g.id} />
            <IconBtn icon="users" label="أعضاء المجموعة" href={'#/groups/' + g.id} />
            <IconBtn icon="edit" label="تعديل الاسم" disabled={!online} onClick={() => setForm({ id: g.id, name: g.name })} />
            <IconBtn icon="trash" tone="danger" label="حذف" disabled={!online} onClick={() => del(g)} />
          </div>
        </div>
      ))}
      {form && <GroupForm initial={form} onClose={() => setForm(null)} onSaved={(g, created) => { setForm(null); flash.ok(created ? 'تمت إضافة المجموعة. افتحها لإضافة الأعضاء.' : 'تم حفظ التعديل'); reload(); }} />}
    </div>
  );
}
