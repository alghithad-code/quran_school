import { useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { SURAHS } from '../quran.js';
import { Modal, todayStr } from '../ui.jsx';

const newId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
const KIND_AR = { hifz: 'حفظ', review: 'مراجعة' };

// تسجيل حفظ أو مراجعة لعدة سور مقررة دفعة واحدة: سورة كاملة أو آيات محددة لكل سورة، وتقييم موحّد أو مستقل لكل سورة.
// requestId ثابت طوال فتح النافذة: الضغط المتكرر أو إعادة الإرسال لا ينشئ سجلات مكررة.
export default function BatchRecordForm({ enrollmentId, kind, surahs, scale, progress, onDone, onClose }) {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState({}); // surah -> { scope, from, to, grade }
  const [gradeMode, setGradeMode] = useState('same');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const requestId = useRef(newId());
  const prog = useMemo(() => Object.fromEntries((progress?.surahs || []).map((x) => [x.surah, x])), [progress]);
  const selected = surahs.filter((n) => rows[n]);

  const toggle = (n) => setRows((r) => { const c = { ...r }; if (c[n]) delete c[n]; else c[n] = { scope: 'full', from: '1', to: String(SURAHS[n - 1].ayahs), grade: '' }; return c; });
  const patch = (n, p) => setRows((r) => ({ ...r, [n]: { ...r[n], ...p } }));

  // التحقق قبل الحفظ: أول مشكلة تظهر وتمنع الإرسال
  const problem = useMemo(() => {
    if (!selected.length) return 'اختر سورة واحدة على الأقل';
    for (const n of selected) {
      const r = rows[n], max = SURAHS[n - 1].ayahs;
      if (r.scope === 'range') {
        const f = Number(r.from), t = Number(r.to);
        if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < f || t > max) return `سورة ${SURAHS[n - 1].name}: الآيات بين 1 و${max} (من ≤ إلى)`;
      }
    }
    return '';
  }, [rows, selected]);

  async function submit(e) {
    e.preventDefault();
    if (busy || problem) return;
    setBusy(true); setErr('');
    try {
      const body = {
        type: kind, date, requestId: requestId.current, gradeMode, grade,
        items: selected.map((n) => ({ surah: n, scope: rows[n].scope, fromAyah: rows[n].from, toAyah: rows[n].to, grade: rows[n].grade })),
      };
      const res = await api(`/enrollments/${enrollmentId}/recitations/batch`, { method: 'POST', body });
      const n = res.records.length;
      onDone(res.duplicate ? 'تم تسجيل هذه العملية مسبقاً، لم يُكرَّر شيء' : `تم تسجيل ${KIND_AR[kind]} ${n === 1 ? 'سورة واحدة' : n <= 10 ? `${n} سور` : `${n} سورة`} بنجاح`);
    } catch (er) { setErr(er.message); setBusy(false); }
  }

  const gradeSelect = (value, onChange) => <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">بلا تقييم</option>{scale.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>;

  return (
    <Modal title={`تسجيل ${KIND_AR[kind]} جماعي`} onClose={onClose}>
      <form onSubmit={submit}>
        <label>التاريخ<input type="date" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} required /></label>

        <div className="row between" style={{ marginBottom: 6 }}>
          <b>السور المقررة ({selected.length} من {surahs.length})</b>
          <span className="irow">
            <button type="button" className="chip" onClick={() => setRows(Object.fromEntries(surahs.map((n) => [n, rows[n] || { scope: 'full', from: '1', to: String(SURAHS[n - 1].ayahs), grade: '' }])))}>تحديد الكل</button>
            <button type="button" className="chip" onClick={() => setRows({})}>مسح</button>
          </span>
        </div>

        <div className="bsurahs">
          {surahs.map((n) => {
            const s = SURAHS[n - 1], r = rows[n], p = prog[n];
            const have = p ? (kind === 'hifz' ? p.memorized : p.reviewed) : 0;
            return (
              <div key={n} className={'bsurah' + (r ? ' on' : '')}>
                <label className="check">
                  <input type="checkbox" checked={!!r} onChange={() => toggle(n)} />
                  <span className="grow">{s.name} <small className="muted">· {s.ayahs} آية{have ? ` · ${kind === 'hifz' ? 'محفوظ' : 'روجع'} ${have}` : ''}</small></span>
                </label>
                {r && (
                  <div className="bsub">
                    <div className="row" style={{ marginBottom: 6 }}>
                      <button type="button" className={'btn seg' + (r.scope === 'full' ? ' on' : '')} onClick={() => patch(n, { scope: 'full', from: '1', to: String(s.ayahs) })}>السورة كاملة</button>
                      <button type="button" className={'btn seg' + (r.scope === 'range' ? ' on' : '')} onClick={() => patch(n, { scope: 'range' })}>آيات محددة</button>
                    </div>
                    {r.scope === 'range' ? (
                      <div className="row" style={{ marginBottom: 6 }}>
                        <label className="grow">من آية<input type="number" inputMode="numeric" min="1" max={s.ayahs} value={r.from} onChange={(e) => patch(n, { from: e.target.value })} /></label>
                        <label className="grow">إلى آية<input type="number" inputMode="numeric" min="1" max={s.ayahs} value={r.to} onChange={(e) => patch(n, { to: e.target.value })} /></label>
                      </div>
                    ) : <div className="small muted" style={{ marginBottom: 6 }}>الآيات 1–{s.ayahs} (تُحدَّد تلقائياً)</div>}
                    {gradeMode === 'each' && <label style={{ marginBottom: 0 }}>تقييم {s.name}{gradeSelect(r.grade, (v) => patch(n, { grade: v }))}</label>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className={'btn seg' + (gradeMode === 'same' ? ' on' : '')} onClick={() => setGradeMode('same')}>تقييم موحّد</button>
          <button type="button" className={'btn seg' + (gradeMode === 'each' ? ' on' : '')} onClick={() => setGradeMode('each')}>تقييم لكل سورة</button>
        </div>
        {gradeMode === 'same' ? <label>التقييم (لكل السور المحددة){gradeSelect(grade, setGrade)}</label> : <p className="small muted">اختر تقييماً مستقلاً بجانب كل سورة محددة أعلاه.</p>}

        {(err || (problem && selected.length > 0)) && <div className="alert">{err || problem}</div>}
        <button className="btn block" disabled={busy || !!problem}>{busy ? 'جارٍ الحفظ…' : `حفظ ${selected.length ? `(${selected.length})` : ''}`}</button>
      </form>
    </Modal>
  );
}
