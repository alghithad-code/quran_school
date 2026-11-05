import { useState } from 'react';
import { api } from '../api.js';
import { BackLink, ErrorBox, Icon, Loading, initial, useFlash, useLoad } from '../ui.jsx';
import { useTeacherTools } from '../teacherTools.jsx';
import Students from './Students.jsx';

export default function TeacherDetail({ id, me, online }) {
  const info = useLoad(() => api('/users/' + id), [id]);
  const stats = useLoad(() => api('/reports/teacher/' + id), [id]);
  const [fq, setFq] = useState({});
  const flash = useFlash();
  const tools = useTeacherTools({ online, flash, onChanged: () => { info.reload(); stats.reload(); } });

  if (info.loading) return <Loading />;
  if (info.error) return <div><ErrorBox text={info.error} /><a className="btn ghost" href="#/teachers">رجوع</a></div>;
  const u = info.data.user;
  const pick = (name) => stats.data?.summary.find(([k]) => k === name)?.[1] ?? '—';

  return (
    <div>
      <BackLink fallback="/teachers">‹ المعلمون</BackLink>
      <div className="card tcard">
        <div className="sc-head">
          <div className="avatar">{initial(u.name)}</div>
          <h2 className="h name" style={{ margin: 0 }}>{u.name}</h2>
          <span className={'tag ' + (u.status === 'active' ? 'ok' : 'bad')}>{u.status === 'active' ? 'نشط' : 'موقوف'}</span>
        </div>
        <div className="metas">
          <span className="m"><Icon name="users" size={14} />{u.studentCount} طالب</span>
          {u.levels?.length > 0 ? u.levels.map((l) => <span className="m" key={l.id}><Icon name="layers" size={14} />{l.name}</span>) : <span className="m">لم تُحدَّد مستويات</span>}
          <span className="m" dir="ltr">@{u.username}</span>
        </div>
        {tools.buttons(u, { link: false })}
      </div>
      {flash.node}

      <div className="grid">
        <div className="stat"><b>{pick('نسبة الحضور')}</b><span>نسبة حضور طلابه (الشهر)</span></div>
        <div className="stat"><b>{pick('متوسط تقييم الحفظ')}</b><span>متوسط الحفظ</span></div>
        <div className="stat"><b>{pick('متوسط تقييم المراجعة')}</b><span>متوسط المراجعة</span></div>
      </div>

      <h3>طلاب المعلم</h3>
      <Students me={me} online={online} embedded query={{ ...fq, teacherId: id }} onFilter={(k, v) => setFq((s) => ({ ...s, [k]: v }))} />
      {tools.modals}
    </div>
  );
}
