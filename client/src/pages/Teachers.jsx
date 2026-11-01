import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, Icon, IconBtn, Loading, Modal, initial, qs, useFlash } from '../ui.jsx';
import { useTeacherTools } from '../teacherTools.jsx';

export default function Teachers({ online, query }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const status = query.status || '';

  const load = useCallback(async () => {
    try { setItems((await api('/users' + qs({ role: 'teacher', limit: 50, q, status }))).items); } catch (e) { flash.err(e); }
  }, [q, status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const tools = useTeacherTools({ online, flash, onChanged: load });

  async function create(e) {
    e.preventDefault(); setBusy(true);
    try { await api('/users', { method: 'POST', body: { ...form, role: 'teacher' } }); flash.ok('تم إنشاء حساب المعلم'); setForm(null); load(); } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const filt = (s) => { window.location.hash = '#/teachers' + qs({ status: s }); };

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="بحث بالاسم أو اسم المستخدم أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        <IconBtn icon="plus" tone="on" caption="معلم" label="إضافة معلم" disabled={!online} onClick={() => setForm({ name: '', username: '', phone: '', password: '' })} />
      </div>
      <div className="chips">
        {[['', 'الكل'], ['active', 'النشطون'], ['suspended', 'الموقوفون']].map(([k, v]) => <button key={k} className={'chip' + (status === k ? ' on' : '')} onClick={() => filt(k)}>{v}</button>)}
      </div>
      {flash.node}
      {items === null && <Loading />}
      {items?.length === 0 && <Empty text="لا يوجد معلمون" />}
      {items?.map((u) => (
        <div className="card tcard" key={u.id}>
          <div className="sc-head">
            <div className="avatar">{initial(u.name)}</div>
            <a className="name" href={'#/teachers/' + u.id}>{u.name}</a>
            <span className={'tag ' + (u.status === 'active' ? 'ok' : 'bad')}>{u.status === 'active' ? 'نشط' : 'موقوف'}</span>
          </div>
          <div className="metas">
            <span className="m"><Icon name="users" size={14} />{u.studentCount} طالب</span>
            {u.levels?.length > 0 ? u.levels.map((l) => <span className="m" key={l.id}><Icon name="layers" size={14} />{l.name}</span>) : <span className="m">بلا مستوى</span>}
          </div>
          {tools.buttons(u)}
        </div>
      ))}
      {tools.modals}
      {form && (
        <Modal title="معلم جديد" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            <label>الاسم<input value={form.name} onChange={set('name')} required /></label>
            <label>اسم المستخدم<input dir="ltr" value={form.username} onChange={set('username')} required /></label>
            <label>رقم الجوال (اختياري)<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={set('phone')} /></label>
            <label>كلمة المرور (6 أحرف على الأقل، حروف وأرقام)<input dir="ltr" type="password" minLength={6} value={form.password} onChange={set('password')} required /></label>
            <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
