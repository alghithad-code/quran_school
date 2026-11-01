import { useState } from 'react';
import { api } from '../api.js';
import { Empty, Loading, fmtDT, useFlash, useLoad } from '../ui.jsx';

const ST = { pending: ['معلّق', 'warn'], approved: ['موافَق', 'ok'], rejected: ['مرفوض', 'bad'] };

export default function Promotions({ me, online }) {
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useLoad(() => api('/promotions' + (status ? '?status=' + status : '')), [status]);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const isManager = me.role !== 'teacher';

  async function decide(r, approve) {
    const note = prompt(approve ? 'ملاحظة القرار (اختياري)' : 'سبب الرفض (اختياري)');
    if (note === null) return;
    setBusy(true); flash.clear();
    try { await api(`/promotions/${r.id}/decision`, { method: 'POST', body: { approve, note } }); flash.ok(approve ? 'تمت الموافقة ونُقل الطالب' : 'تم الرفض'); await reload(); } catch (e) { flash.err(e); } finally { setBusy(false); }
  }

  return (
    <div>
      <h2 className="h">{isManager ? 'طلبات الترقية' : 'طلبات الترقية التي رفعتها'}</h2>
      <div className="chips">
        {[['', 'الكل'], ['pending', 'المعلّقة'], ['approved', 'الموافَق'], ['rejected', 'المرفوضة']].map(([k, v]) => <button key={k} className={'chip' + (status === k ? ' on' : '')} onClick={() => setStatus(k)}>{v}</button>)}
      </div>
      {flash.node}
      {loading && <Loading />}
      {data?.items.length === 0 && <Empty text="لا توجد طلبات" />}
      {data?.items.map((r) => (
        <div className="card item" key={r.id}>
          <div className="row between">
            {r.student ? <a className="name" href={'#/students/' + r.student.id}>{r.student.name}</a> : <b>—</b>}
            <span className={'tag ' + ST[r.status][1]}>{ST[r.status][0]}</span>
          </div>
          <div className="small">{r.from} ← {r.to} <span className="muted">· المعلم {r.teacher} · {fmtDT(r.createdAt)}</span></div>
          {r.snapshot && (
            <div className="small muted">
              آخر 30 يوماً: حضور {r.snapshot.present} / غياب {r.snapshot.absent} ({r.snapshot.rate}%)
              · متوسط الحفظ {r.snapshot.hifz.avg ?? '—'} ({r.snapshot.hifz.count} مقطع)
              · متوسط المراجعة {r.snapshot.review.avg ?? '—'} ({r.snapshot.review.count} مقطع)
            </div>
          )}
          {r.note && <div className="small">ملاحظة المعلم: {r.note}</div>}
          {r.status !== 'pending' && <div className="small muted">القرار: {r.decidedBy} · {fmtDT(r.decidedAt)} {r.decisionNote && `· ${r.decisionNote}`}</div>}
          {isManager && r.status === 'pending' && (
            <div className="row" style={{ marginBottom: 0 }}>
              <button className="btn" disabled={!online || busy} onClick={() => decide(r, true)}>موافقة</button>
              <button className="btn ghost danger" disabled={!online || busy} onClick={() => decide(r, false)}>رفض</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
