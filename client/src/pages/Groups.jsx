import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SURAHS } from '../quran.js';
import { SurahPicker } from '../surahPicker.jsx';
import { Empty, GOAL_AR, Icon, IconBtn, Loading, Modal, goalText, summarizeSurahs, useFlash, useLoad } from '../ui.jsx';

export const blankGroup = { name: '', goalType: 'full_review', goalText: '', surahs: [], teacherIds: [] };

// نموذج إنشاء/تعديل مجموعة (يُستخدم أيضاً في صفحة المجموعة)
export function GroupForm({ initial, teachers, onSaved, onClose }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const body = { name: f.name, goalType: f.goalType, goalText: f.goalText, surahs: f.surahs, teacherIds: f.teacherIds };
      const r = f.id ? await api('/groups/' + f.id, { method: 'PATCH', body }) : await api('/groups', { method: 'POST', body });
      onSaved(r.group, !f.id);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  const togTeacher = (id, on) => setF((s) => ({ ...s, teacherIds: on ? [...s.teacherIds, id] : s.teacherIds.filter((x) => x !== id) }));
  return (
    <Modal title={f.id ? 'تعديل المجموعة' : 'مجموعة جديدة'} onClose={onClose}>
      <form onSubmit={submit}>
        <label>اسم المجموعة<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label>الهدف من المجموعة
          <select value={f.goalType} onChange={(e) => setF({ ...f, goalType: e.target.value })}>
            {Object.entries(GOAL_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>{f.goalType === 'custom' ? 'اكتب الهدف' : 'تفاصيل الهدف (اختياري)'}
          <input value={f.goalText} onChange={(e) => setF({ ...f, goalText: e.target.value })} maxLength={300} required={f.goalType === 'custom'} placeholder="مثال: إتقان أحكام النون الساكنة" />
        </label>
        {f.goalType === 'surah_review' && (<><h3>السور المطلوب مراجعتها</h3><SurahPicker value={f.surahs} onChange={(surahs) => setF({ ...f, surahs })} taken={{}} /></>)}
        <h3 style={{ marginTop: 12 }}>معلمو المجموعة</h3>
        {teachers.length === 0 && <p className="small muted">لا يوجد معلمون نشطون.</p>}
        {teachers.map((t) => (
          <label key={t.id} className="check"><input type="checkbox" checked={f.teacherIds.includes(t.id)} onChange={(e) => togTeacher(t.id, e.target.checked)} />{t.name}</label>
        ))}
        {err && <div className="alert">{err}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
      </form>
    </Modal>
  );
}

export default function Groups({ me, online }) {
  const isManager = me.role !== 'teacher';
  const { data, loading, reload } = useLoad(() => api('/groups'), []);
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState(null);
  const flash = useFlash();

  useEffect(() => { if (isManager) api('/users?role=teacher&status=active&limit=50').then((d) => setTeachers(d.items)).catch(() => {}); }, [isManager]);

  async function del(g) {
    if (!confirm(`حذف المجموعة «${g.name}»؟ لا تُحذف أي بيانات للطلاب.`)) return;
    try { await api('/groups/' + g.id, { method: 'DELETE' }); flash.ok('تم حذف المجموعة'); reload(); } catch (e) { flash.err(e); }
  }

  if (loading) return <Loading />;
  return (
    <div>
      <div className="row between">
        <h2 className="h" style={{ margin: 0 }}>المجموعات</h2>
        {isManager && <IconBtn icon="plus" tone="on" caption="مجموعة" label="إضافة مجموعة" disabled={!online} onClick={() => setForm({ ...blankGroup })} />}
      </div>
      <p className="small muted">مجموعات بأهداف محددة (مراجعة أو تجويد). الطالب والمعلم يمكن أن يكونا في مجموعة ومستوى معاً.</p>
      {flash.node}
      {data?.items.length === 0 && <Empty text={isManager ? 'لم تُنشأ مجموعات بعد' : 'لم تُعيَّن في أي مجموعة'} />}
      {data?.items.map((g) => (
        <div className="card tcard" key={g.id}>
          <div className="sc-head">
            <div className="avatar"><Icon name="grid" size={22} /></div>
            <a className="name" href={'#/groups/' + g.id}>{g.name}</a>
          </div>
          <div className="metas">
            <span className="goal">{goalText(g)}</span>
            <span className="m"><Icon name="users" size={14} />{g.studentCount} طالب</span>
            {g.teachers.map((t) => <span className="m" key={t.id}><Icon name="user" size={14} />{t.name}</span>)}
          </div>
          {g.surahs.length > 0 && <div className="small muted">{summarizeSurahs(g.surahs, SURAHS)}</div>}
          <div className="irow">
            <IconBtn icon="users" label="فتح المجموعة" href={'#/groups/' + g.id} />
            {isManager && <IconBtn icon="edit" label="تعديل" disabled={!online} onClick={() => setForm({ ...g, teacherIds: g.teachers.map((t) => t.id) })} />}
            {isManager && <IconBtn icon="trash" tone="danger" label="حذف" disabled={!online} onClick={() => del(g)} />}
          </div>
        </div>
      ))}
      {form && <GroupForm initial={form} teachers={teachers} onClose={() => setForm(null)} onSaved={(g, created) => { setForm(null); flash.ok(created ? 'تمت إضافة المجموعة' : 'تم حفظ التعديل'); reload(); if (created) window.location.hash = '#/groups/' + g.id; }} />}
    </div>
  );
}
