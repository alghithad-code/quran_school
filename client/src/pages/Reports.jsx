import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, IconBtn, Loading, go, qs, todayStr, useLoad } from '../ui.jsx';

function Report({ path }) {
  const { data, loading, error } = useLoad(() => api(path), [path]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox text={error} />;
  const xlsx = '/api' + path + (path.includes('?') ? '&' : '?') + 'format=xlsx';
  return (
    <div className="report">
      <div className="irow noprint" style={{ marginBottom: 10 }}>
        <IconBtn icon="printer" tone="gold" caption="طباعة / PDF" label="طباعة أو حفظ PDF" onClick={() => window.print()} />
        <IconBtn icon="download" tone="ok" caption="Excel" label="تصدير Excel" href={xlsx} />
      </div>
      <h2 className="h">{data.title}</h2>
      <p className="muted small">الفترة: {data.period.from} إلى {data.period.to}</p>
      <div className="card">
        {data.summary.map(([k, v], i) => <div className="line" key={i}><span>{k}</span><b>{String(v)}</b></div>)}
      </div>
      {data.tables.map((t, i) => (
        <div className="card" key={i}>
          <h3>{t.title}</h3>
          {t.rows.length === 0 ? <p className="muted small">لا توجد بيانات</p> : (
            <div className="scroll">
              <table>
                <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{t.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{String(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Reports({ me, query }) {
  const isManager = me.role !== 'teacher';
  const type = query.type || (isManager ? 'school' : 'teacher');
  const id = type === 'teacher' && !isManager ? me.id : query.id || '';
  const month = query.month || todayStr().slice(0, 7);
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [found, setFound] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    if (isManager) api('/users?role=teacher&limit=50').then((d) => setTeachers(d.items)).catch(() => {});
    api('/levels').then((d) => setLevels(d.items)).catch(() => {});
  }, [isManager]);
  useEffect(() => {
    if (type !== 'student' || id || text.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => api('/students' + qs({ q: text.trim(), limit: 8, status: 'all' })).then((d) => setFound(d.items)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [text, type, id]);

  const nav = (patch) => go('/reports' + qs({ type, id, month, teacherId: query.teacherId, levelId: query.levelId, ...patch }));
  const types = isManager ? [['school', 'المدرسة'], ['teacher', 'معلم'], ['student', 'طالب']] : [['teacher', 'تقريري'], ['student', 'طالب']];

  let path = null;
  if (type === 'school' && isManager) path = '/reports/school' + qs({ month, teacherId: query.teacherId, levelId: query.levelId });
  else if (type === 'teacher' && id) path = `/reports/teacher/${id}` + qs({ month });
  else if (type === 'student' && id) path = `/reports/student/${id}` + qs({ month });

  return (
    <div>
      <div className="noprint">
        <h2 className="h">التقارير</h2>
        <div className="chips">{types.map(([k, v]) => <button key={k} className={'chip' + (type === k ? ' on' : '')} onClick={() => go('/reports' + qs({ type: k, month }))}>{v}</button>)}</div>
        <label>الشهر<input type="month" value={month} max={todayStr().slice(0, 7)} onChange={(e) => e.target.value && nav({ month: e.target.value })} /></label>
        {type === 'teacher' && isManager && (
          <label>المعلم<select value={id} onChange={(e) => nav({ id: e.target.value })}><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        )}
        {type === 'school' && (
          <div className="row">
            <label className="grow">المعلم<select value={query.teacherId || ''} onChange={(e) => nav({ teacherId: e.target.value })}><option value="">الكل</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="grow">المستوى<select value={query.levelId || ''} onChange={(e) => nav({ levelId: e.target.value })}><option value="">الكل</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          </div>
        )}
        {type === 'student' && !id && (
          <>
            <label>ابحث عن طالب<input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب حرفين على الأقل" /></label>
            {found.map((s) => <button key={s.id} className="card line" style={{ width: '100%' }} onClick={() => nav({ id: s.id })}><span>{s.name}</span><small className="muted">{s.level?.name || ''}</small></button>)}
          </>
        )}
        {type === 'student' && id && <IconBtn icon="repeat" caption="اختيار طالب آخر" label="اختيار طالب آخر" onClick={() => nav({ id: '' })} />}
      </div>
      {path ? <Report path={path} /> : <p className="muted center noprint">{type === 'teacher' ? 'اختر معلماً لعرض التقرير' : type === 'student' ? 'اختر طالباً لعرض التقرير' : ''}</p>}
    </div>
  );
}
