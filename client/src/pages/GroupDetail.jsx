import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SURAHS } from '../quran.js';
import { Empty, ErrorBox, Icon, IconBtn, Loading, Modal, STATUS_AR, goalText, initial, summarizeSurahs, useFlash, useLoad } from '../ui.jsx';
import { GroupForm } from './Groups.jsx';

function AddMembers({ groupId, existing, onDone, onClose }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api('/students?limit=40&q=' + encodeURIComponent(q)).then((d) => setList(d.items)).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(t);
  }, [q]);
  async function save() {
    setBusy(true); setErr('');
    try { await api(`/groups/${groupId}/members`, { method: 'POST', body: { add: [...sel] } }); onDone(sel.size); } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="إضافة طلاب للمجموعة" onClose={onClose}>
      <input placeholder="ابحث باسم الطالب" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ margin: '10px 0', maxHeight: '45dvh', overflow: 'auto' }}>
        {list.map((s) => {
          const inGroup = existing.has(s.id);
          return (
            <label key={s.id} className="check" style={{ padding: '6px 0', opacity: inGroup ? 0.5 : 1 }}>
              <input type="checkbox" disabled={inGroup} checked={inGroup || sel.has(s.id)} onChange={(e) => setSel((p) => { const n = new Set(p); e.target.checked ? n.add(s.id) : n.delete(s.id); return n; })} />
              <span>{s.name}<small className="muted"> · {s.enrollments.map((e) => e.level?.name || 'بلا مستوى').join('، ') || 'بلا تسجيل'}{inGroup ? ' · مضاف' : ''}</small></span>
            </label>
          );
        })}
      </div>
      {err && <div className="alert">{err}</div>}
      <button className="btn block" disabled={busy || !sel.size} onClick={save}>{busy ? 'جارٍ الإضافة…' : `إضافة (${sel.size})`}</button>
    </Modal>
  );
}

export default function GroupDetail({ id, me, online }) {
  const isManager = me.role !== 'teacher';
  const { data, loading, error, reload } = useLoad(() => api('/groups/' + id), [id]);
  const [teachers, setTeachers] = useState([]);
  const [modal, setModal] = useState(null);
  const flash = useFlash();

  useEffect(() => { if (isManager) api('/users?role=teacher&status=active&limit=50').then((d) => setTeachers(d.items)).catch(() => {}); }, [isManager]);

  if (loading) return <Loading />;
  if (error) return <div><ErrorBox text={error} /><a className="btn ghost" href="#/groups">رجوع</a></div>;
  const g = data.group;

  async function remove(m) {
    if (!confirm(`إزالة ${m.name} من المجموعة؟`)) return;
    try { await api(`/groups/${id}/members`, { method: 'POST', body: { remove: [m.id] } }); flash.ok('تمت الإزالة'); reload(); } catch (e) { flash.err(e); }
  }
  async function del() {
    if (!confirm(`حذف المجموعة «${g.name}»؟ لا تُحذف أي بيانات للطلاب.`)) return;
    try { await api('/groups/' + id, { method: 'DELETE' }); window.location.hash = '#/groups'; } catch (e) { flash.err(e); }
  }

  return (
    <div>
      <a className="back" href="#/groups">‹ المجموعات</a>
      <div className="card tcard">
        <div className="sc-head"><div className="avatar"><Icon name="grid" size={22} /></div><h2 className="h name" style={{ margin: 0 }}>{g.name}</h2></div>
        <div className="metas">
          <span className="goal">{goalText(g)}</span>
          <span className="m"><Icon name="users" size={14} />{g.studentCount} طالب</span>
        </div>
        {g.surahs.length > 0 && <div className="small">السور: {summarizeSurahs(g.surahs, SURAHS)}</div>}
        <div className="small muted">المعلمون: {g.teachers.length ? g.teachers.map((t) => t.name).join('، ') : 'لم يُعيَّن معلم'}</div>
        {isManager && (
          <div className="irow">
            <IconBtn icon="plus" tone="ok" caption="طلاب" label="إضافة طلاب" disabled={!online} onClick={() => setModal('add')} />
            <IconBtn icon="edit" label="تعديل المجموعة" disabled={!online} onClick={() => setModal('edit')} />
            <IconBtn icon="trash" tone="danger" label="حذف المجموعة" disabled={!online} onClick={del} />
          </div>
        )}
      </div>
      {flash.node}
      <h3>الطلاب</h3>
      {data.members.length === 0 && <Empty text="لا يوجد طلاب في المجموعة" />}
      {data.members.map((m) => (
        <div className="card scard" key={m.id}>
          <div className="sc-head">
            <div className="avatar">{initial(m.name)}</div>
            {m.canOpen ? <a className="name" href={'#/students/' + m.id}>{m.name}</a> : <b className="name">{m.name}</b>}
            {m.status !== 'active' && <span className="tag bad">{STATUS_AR[m.status]}</span>}
          </div>
          <div className="metas">
            <span className="m"><Icon name="layers" size={14} />{m.level || 'بلا مستوى'}</span>
            {m.teacher && <span className="m"><Icon name="user" size={14} />{m.teacher}</span>}
          </div>
          <div className="irow">
            {m.canOpen && <IconBtn icon="file" label="ملف الطالب" href={'#/students/' + m.id} />}
            {isManager && <IconBtn icon="x" tone="danger" label="إزالة من المجموعة" disabled={!online} onClick={() => remove(m)} />}
          </div>
        </div>
      ))}
      {modal === 'edit' && <GroupForm initial={{ ...g, teacherIds: g.teachers.map((t) => t.id) }} teachers={teachers} onClose={() => setModal(null)} onSaved={() => { setModal(null); flash.ok('تم حفظ التعديل'); reload(); }} />}
      {modal === 'add' && <AddMembers groupId={id} existing={new Set(data.members.map((m) => m.id))} onClose={() => setModal(null)} onDone={(n) => { setModal(null); flash.ok(`تمت إضافة ${n} طالب`); reload(); }} />}
    </div>
  );
}
