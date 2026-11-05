import { useState } from 'react';
import { api } from '../api.js';
import { BackLink, ErrorBox, Icon, IconBtn, Loading, fmtDT, useLoad } from '../ui.jsx';

// قائمة مستلمي رسالة جماعية: لكل عضو زر واتساب برسالة جاهزة باسمه، وتُعلَّم «أُرسل له» عند الضغط
export default function GroupMessage({ id, mid, online }) {
  const { data, loading, error } = useLoad(() => api(`/groups/${id}/messages/${mid}`), [id, mid]);
  const [done, setDone] = useState({}); // studentId -> true (بعد الضغط)

  if (loading) return <Loading />;
  if (error) return <div><ErrorBox text={error} /><BackLink fallback={`/groups/${id}`}>رجوع</BackLink></div>;
  const m = data.message;
  const state = (r) => (done[r.studentId] ? 'opened' : r.status);
  const opened = m.recipients.filter((r) => state(r) === 'opened').length;
  const pending = m.recipients.filter((r) => state(r) === 'pending');
  const withPhone = m.recipients.length - m.noPhone;

  function mark(r) {
    setDone((d) => ({ ...d, [r.studentId]: true }));
    api(`/groups/${id}/messages/${mid}/opened`, { method: 'POST', body: { studentId: r.studentId } }).catch(() => {}); // فشل التتبع لا يمنع الإرسال
  }
  function next() {
    const r = pending[0];
    if (!r) return;
    window.open(r.link, '_blank', 'noopener');
    mark(r);
  }

  return (
    <div>
      <BackLink fallback={`/groups/${id}`}>‹ {data.group.name}</BackLink>
      <div className="card">
        <h3>رسالة لمجموعة «{data.group.name}»</h3>
        <div className="wa-preview">{m.text}</div>
        <p className="small muted">{fmtDT(m.at)}</p>
        <div className="row between" style={{ marginBottom: 6 }}>
          <b>تم فتح {opened} من {withPhone}</b>
          {m.noPhone > 0 && <span className="tag warn">{m.noPhone} بلا رقم</span>}
        </div>
        <div className="pbar"><i style={{ width: `${withPhone ? (opened / withPhone) * 100 : 0}%` }} /></div>
        <div className="irow" style={{ marginTop: 10 }}>
          <IconBtn icon="chat" tone="wa" caption={pending.length ? `التالي (${pending[0].name})` : 'اكتمل الإرسال'} label="فتح واتساب للعضو التالي" onClick={next} />
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>يفتح واتساب برسالة جاهزة، فاضغط إرسال ثم ارجع إلى التطبيق واضغط «التالي». النظام لا يعرف إن ضغطت إرسال فعلاً، بل يعلّم العضو بمجرد فتح الرسالة له.</p>
      </div>

      {m.recipients.map((r) => {
        const s = state(r);
        return (
          <div className="card item" key={r.studentId} style={{ opacity: s === 'nophone' ? 0.6 : 1 }}>
            <div className="row between">
              <b>{r.name}</b>
              {s === 'opened' && <span className="tag ok"><Icon name="check" size={13} /> تم الفتح</span>}
              {s === 'pending' && <span className="tag warn">لم يُرسل</span>}
              {s === 'nophone' && <span className="tag bad">بلا رقم</span>}
            </div>
            {r.phone && <div className="muted small" dir="ltr" style={{ textAlign: 'right' }}>+{r.phone}</div>}
            {s !== 'nophone' && (
              <div className="irow">
                <IconBtn icon="chat" tone="wa" caption={s === 'opened' ? 'إعادة الفتح' : 'إرسال واتساب'} label={`فتح واتساب لـ ${r.name}`} href={r.link} onClick={() => mark(r)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
