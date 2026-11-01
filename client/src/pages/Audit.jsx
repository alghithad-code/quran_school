import { useState } from 'react';
import { api } from '../api.js';
import { ACTION_AR, Empty, Loading, fmtDT, qs, useLoad } from '../ui.jsx';

const GROUPS = [['', 'الكل'], ['user', 'الحسابات'], ['student', 'الطلاب'], ['attendance', 'الحضور'], ['recitation', 'الحفظ والمراجعة'], ['promotion', 'الترقية'], ['level', 'المستويات'], ['backup', 'النسخ'], ['settings', 'الإعدادات']];

export default function Audit() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useLoad(() => api('/audit' + qs({ action, from, to, page })), [action, from, to, page]);

  return (
    <div>
      <h2 className="h">سجل العمليات</h2>
      <p className="small muted">للقراءة فقط. لا يمكن تعديل هذا السجل أو حذفه من النظام.</p>
      <div className="chips">{GROUPS.map(([k, v]) => <button key={k} className={'chip' + (action === k ? ' on' : '')} onClick={() => { setAction(k); setPage(1); }}>{v}</button>)}</div>
      <div className="row">
        <label className="grow">من<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="grow">إلى<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
      </div>
      {loading && <Loading />}
      {data?.items.length === 0 && <Empty text="لا توجد عمليات" />}
      {data?.items.map((a) => (
        <div className="card item" key={a.id}>
          <div className="row between"><b>{ACTION_AR[a.action] || a.action}</b><small className="muted">{fmtDT(a.at)}</small></div>
          <div className="small">{a.actor}{a.target ? ` ← ${a.target}` : ''}</div>
          {a.details && <details><summary className="small muted">التفاصيل</summary><pre className="pre">{JSON.stringify(a.details, null, 1)}</pre></details>}
        </div>
      ))}
      {data && data.pages > 1 && (
        <div className="row between">
          <button className="btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="muted small">{page} / {data.pages}</span>
          <button className="btn ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
    </div>
  );
}
