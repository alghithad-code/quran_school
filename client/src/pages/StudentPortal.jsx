import { useState } from 'react';
import { api } from '../api.js';
import { DAYS_AR, Empty, ErrorBox, Loading, Progress, fmtDT, fmtTime, gradeLabel, useLoad } from '../ui.jsx';

const LVL_AR = { assign: 'تسجيل في المستوى', promotion: 'ترقية', demotion: 'نقل لمستوى أدنى' };
const CAT_AR = { hifz: 'الحفظ', review: 'المراجعة', behavior: 'السلوك', discipline: 'الانضباط', general: 'ملاحظة' };

// لون التقييم بحسب درجته في سلّم التقييم
const gradeTone = (scale, key) => { const g = scale.find((x) => x.key === key); if (!g) return ''; return g.score >= 4 ? 'ok' : g.score >= 3 ? '' : g.score >= 1 ? 'warn' : 'bad'; };
const dayName = (date) => DAYS_AR[new Date(date + 'T00:00:00').getDay()];
function whenText(ns) {
  if (!ns) return null;
  if (ns.inDays === 0) return 'اليوم';
  if (ns.inDays === 1) return 'غداً';
  return `يوم ${dayName(ns.date)} (بعد ${ns.inDays} أيام)`;
}

// صفحة الطالب: قراءة فقط. كل مستوى في تبويب مستقل (الحالي أولاً ثم السابقة).
export default function StudentPortal() {
  const ld = useLoad(() => api('/portal/me'), []);
  const [eid, setEid] = useState(null);

  if (ld.loading) return <Loading />;
  if (ld.error) return <ErrorBox text={ld.error} />;
  const { student, gradeScale: scale, enrollments, levelChanges } = ld.data;
  const cur = enrollments.find((e) => e.id === eid) || enrollments[0];
  const lvName = (e) => e.level?.name || 'بلا مستوى';

  return (
    <div>
      <div className="card">
        <h2 className="h" style={{ margin: 0 }}>مرحباً {student.name}</h2>
        <div className="muted small">{student.age ? `${student.age} سنة · ` : ''}التحقت في {student.enrolledAt}</div>
      </div>

      {enrollments.length === 0 && <Empty text="لم تُسجَّل في أي مستوى بعد، تواصل مع المشرف" />}
      {enrollments.length > 0 && (
        <div className="chips">
          {enrollments.map((e) => <button key={e.id} className={'chip' + (e.id === cur.id ? ' on' : '')} onClick={() => setEid(e.id)}>{lvName(e)}{e.status !== 'active' ? ' (سابق)' : ''}</button>)}
        </div>
      )}

      {cur && (
        <>
          <div className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>{lvName(cur)}</h3><span className={'tag' + (cur.status === 'active' ? ' ok' : '')}>{cur.status === 'active' ? 'مستوى حالي' : 'مستوى سابق'}</span></div>
            <div className="small" style={{ marginTop: 6 }}>المعلم: {cur.teacher || '—'}</div>
            <div className="small">موضع الحفظ: {cur.position || '—'}</div>
            {cur.startedAt && <div className="small muted">بدأت في {cur.startedAt}</div>}
          </div>

          <div className="card">
            <h3>تقدّمك في الحفظ</h3>
            {cur.progress ? (
              <>
                <Progress pct={cur.progress.pct} label={`${cur.progress.pct}% — حفظت ${cur.progress.memorized} من ${cur.progress.total} آية من سور المستوى`} />
                {cur.progress.surahs.map((x) => (
                  <div className="srow" key={x.surah}>
                    <div className="row between"><span>{x.name}</span><small className="muted">{x.memorized} من {x.total}{x.memorized === x.total ? ' ✓' : ''}</small></div>
                    <Progress pct={Math.round((x.memorized / x.total) * 100)} thin />
                  </div>
                ))}
              </>
            ) : <p className="muted small" style={{ margin: 0 }}>لم تُحدَّد سور لهذا المستوى بعد، فلا تظهر نسبة التقدم.</p>}
          </div>

          <div className="card">
            <h3>موعد حضورك</h3>
            {cur.schedule.days.length ? (
              <div className="chips" style={{ marginBottom: 8 }}>{DAYS_AR.map((d, i) => cur.schedule.days.includes(i) ? <span key={i} className="chip on">{d}</span> : null)}</div>
            ) : <p className="muted small">لم تُحدَّد أيام الحضور بعد.</p>}
            {(cur.schedule.arrivalTime || cur.schedule.startTime) && (
              <div className="small">الحضور {fmtTime(cur.schedule.arrivalTime) || '—'} · التسميع {fmtTime(cur.schedule.startTime) || '—'} إلى {fmtTime(cur.schedule.endTime) || '—'}</div>
            )}
            {cur.schedule.notes && <div className="small muted">{cur.schedule.notes}</div>}
            {cur.nextSession && <div className="alert" style={{ marginTop: 8, marginBottom: 0 }}>موعدك القادم: <b>{whenText(cur.nextSession)}</b></div>}
          </div>

          <div className="card">
            <h3>حضورك</h3>
            {cur.attendance.total === 0 ? <p className="muted small" style={{ margin: 0 }}>لا توجد سجلات حضور بعد.</p> : (
              <>
                <div className="row wrap" style={{ gap: 14 }}>
                  <span className="tag ok">حاضر {cur.attendance.present}</span>
                  <span className="tag bad">غائب {cur.attendance.absent}</span>
                  <b>نسبة الحضور {cur.attendance.rate}%</b>
                </div>
                <div className="dots" aria-label="آخر أيام الحضور">
                  {cur.attendance.recent.map((a) => <i key={a.date} className={a.status === 'absent' ? 'bad' : ''} title={`${a.date} — ${a.status === 'present' ? 'حاضر' : 'غائب'}`} />)}
                </div>
                <small className="muted">آخر {cur.attendance.recent.length} يوماً (الأحدث أولاً): الأخضر حاضر والأحمر غائب</small>
              </>
            )}
          </div>

          <div className="card">
            <h3>تسميعك وتقييم المعلم</h3>
            {cur.recitations.length === 0 && <p className="muted small" style={{ margin: 0 }}>لا توجد تسميعات مسجلة بعد.</p>}
            {cur.recitations.map((r, i) => (
              <div className="rec" key={i}>
                <div className="row between" style={{ marginBottom: 2 }}>
                  <b>{r.type === 'hifz' ? 'حفظ' : 'مراجعة'} · {r.mode === 'surah' ? `${r.surahName} (${r.fromAyah}–${r.toAyah})` : `صفحة ${r.fromPage}–${r.toPage}`}</b>
                  <small className="muted">{r.date}</small>
                </div>
                {r.grade ? <span className={'tag ' + gradeTone(scale, r.grade)}>{gradeLabel(scale, r.grade)}</span> : <small className="muted">بلا تقييم</small>}
              </div>
            ))}
          </div>

          {cur.notes.length > 0 && (
            <div className="card">
              <h3>ملاحظات المعلم</h3>
              {cur.notes.map((n, i) => (
                <div className="rec" key={i}>
                  <div className="row between" style={{ marginBottom: 2 }}><b>{CAT_AR[n.category] || 'ملاحظة'}</b><small className="muted">{n.date}</small></div>
                  <div className="small">{n.text}</div>
                  {n.by && <small className="muted">{n.by}</small>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {levelChanges.length > 0 && (
        <div className="card">
          <h3>رحلتك في المستويات</h3>
          {levelChanges.map((c, i) => <div className="small" key={i}>{LVL_AR[c.type]}: {c.from ? `${c.from} ← ` : ''}{c.to} <span className="muted">· {fmtDT(c.at)}</span></div>)}
        </div>
      )}
    </div>
  );
}
