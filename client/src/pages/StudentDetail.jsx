import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SURAHS } from '../quran.js';
import { CAT_AR, DAYS_AR, ErrorBox, Loading, Modal, STATUS_AR, fmtDT, go, gradeLabel, qs, summarizeSurahs, todayStr, useFlash, useLoad, useSettings } from '../ui.jsx';

const LVL_AR = { assign: 'تعيين', promotion: 'ترقية', demotion: 'خفض' };

function describe(r, scale) {
  if (r.kind === 'attendance') return { title: r.status === 'present' ? 'حاضر' : 'غائب', sub: r.note, cls: r.status === 'present' ? 'ok' : 'bad' };
  if (r.kind === 'note') return { title: `ملاحظة · ${CAT_AR[r.category]}`, sub: r.text };
  const what = r.type === 'hifz' ? 'حفظ' : 'مراجعة';
  const where = r.mode === 'surah' ? `${r.surahName} (${r.fromAyah}–${r.toAyah})` : `صفحة ${r.fromPage}–${r.toPage}`;
  return { title: `${what} · ${where}`, sub: r.grade ? `التقييم: ${gradeLabel(scale, r.grade)}` : 'بلا تقييم' };
}

// نموذج واحد للإضافة والتعديل: attendance | hifz | review | note
function RecordForm({ studentId, kind, rec, onDone, onClose, scale, levelSurahs = [] }) {
  const editing = !!rec;
  const [f, setF] = useState(() => ({
    date: rec?.date || todayStr(),
    status: rec?.status || 'present', note: rec?.note || '',
    mode: rec?.mode || 'surah', surah: String(rec?.surah || levelSurahs[0] || 1), fromAyah: rec?.fromAyah ?? '', toAyah: rec?.toAyah ?? '',
    fromPage: rec?.fromPage ?? '', toPage: rec?.toPage ?? '', grade: rec?.grade || '',
    category: rec?.category || 'general', text: rec?.text || '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const surah = SURAHS[Number(f.surah) - 1];
  const title = { attendance: 'الحضور', hifz: 'الحفظ', review: 'المراجعة', note: 'ملاحظة' }[kind];

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      let path, body;
      if (kind === 'attendance') { path = 'attendance'; body = { date: f.date, status: f.status, note: f.note }; }
      else if (kind === 'note') { path = 'notes'; body = { date: f.date, category: f.category, text: f.text }; }
      else { path = 'recitations'; body = { date: f.date, type: kind, mode: f.mode, surah: f.surah, fromAyah: f.fromAyah, toAyah: f.toAyah, fromPage: f.fromPage, toPage: f.toPage, grade: f.grade }; }
      if (editing) await api(`/records/${rec.kind}/${rec.id}`, { method: 'PATCH', body });
      else await api(`/students/${studentId}/${path}`, { method: 'POST', body });
      onDone(editing ? 'تم حفظ التعديل' : 'تم الحفظ');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`${editing ? 'تعديل' : 'إضافة'} ${title}`} onClose={onClose}>
      <form onSubmit={submit}>
        {!editing && <label>التاريخ<input type="date" max={todayStr()} value={f.date} onChange={set('date')} /></label>}
        {kind === 'attendance' && (<>
          <div className="row">
            <button type="button" className={'btn seg' + (f.status === 'present' ? ' on' : '')} onClick={() => setF({ ...f, status: 'present' })}>حاضر</button>
            <button type="button" className={'btn seg bad' + (f.status === 'absent' ? ' on' : '')} onClick={() => setF({ ...f, status: 'absent' })}>غائب</button>
          </div>
          <label>ملاحظة (اختياري)<input value={f.note} onChange={set('note')} maxLength={300} /></label>
        </>)}
        {(kind === 'hifz' || kind === 'review') && (<>
          <div className="row">
            <button type="button" className={'btn seg' + (f.mode === 'surah' ? ' on' : '')} onClick={() => setF({ ...f, mode: 'surah' })}>بالسورة والآيات</button>
            <button type="button" className={'btn seg' + (f.mode === 'page' ? ' on' : '')} onClick={() => setF({ ...f, mode: 'page' })}>بالصفحات</button>
          </div>
          {f.mode === 'surah' ? (<>
            <label>السورة<select value={f.surah} onChange={set('surah')}>{levelSurahs.length > 0 && <optgroup label="سور مستوى الطالب">{levelSurahs.map((n) => <option key={'l' + n} value={n}>{n}. {SURAHS[n - 1].name} ({SURAHS[n - 1].ayahs} آية)</option>)}</optgroup>}
              <optgroup label={levelSurahs.length ? 'باقي السور' : 'السور'}>{SURAHS.filter((s) => !levelSurahs.includes(s.number)).map((s) => <option key={s.number} value={s.number}>{s.number}. {s.name} ({s.ayahs} آية)</option>)}</optgroup></select></label>
            <div className="row">
              <label className="grow">من آية<input type="number" inputMode="numeric" min="1" max={surah.ayahs} value={f.fromAyah} onChange={set('fromAyah')} required /></label>
              <label className="grow">إلى آية<input type="number" inputMode="numeric" min="1" max={surah.ayahs} value={f.toAyah} onChange={set('toAyah')} required /></label>
            </div>
          </>) : (
            <div className="row">
              <label className="grow">من صفحة<input type="number" inputMode="numeric" min="1" max="604" value={f.fromPage} onChange={set('fromPage')} required /></label>
              <label className="grow">إلى صفحة<input type="number" inputMode="numeric" min="1" max="604" value={f.toPage} onChange={set('toPage')} required /></label>
            </div>
          )}
          <label>التقييم<select value={f.grade} onChange={set('grade')}><option value="">بلا تقييم</option>{scale.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label>
        </>)}
        {kind === 'note' && (<>
          <label>التصنيف<select value={f.category} onChange={set('category')}>{Object.entries(CAT_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>الملاحظة<textarea rows="3" value={f.text} onChange={set('text')} maxLength={1000} required /></label>
        </>)}
        <ErrorBox text={err} />
        <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
      </form>
    </Modal>
  );
}

export default function StudentDetail({ id, me, online }) {
  const { gradeScale: scale } = useSettings();
  const isManager = me.role !== 'teacher';
  const [type, setType] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const info = useLoad(() => api('/students/' + id), [id]);
  const recs = useLoad(() => api(`/students/${id}/records` + qs({ type, from: range.from, to: range.to })), [id, type, range.from, range.to]);
  const [modal, setModal] = useState(null); // {kind, rec} | {edit:true} | ...
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const flash = useFlash();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isManager) api('/users?role=teacher&status=active&limit=50').then((d) => setTeachers(d.items)).catch(() => {});
    api('/levels').then((d) => setLevels(d.items)).catch(() => {});
  }, [isManager]);

  if (info.loading) return <Loading />;
  if (info.error) return <div><ErrorBox text={info.error} /><a className="btn ghost" href="#/students">رجوع</a></div>;
  const s = info.data.student;
  const active = s.status === 'active';
  const today = todayStr();
  const todayAtt = recs.data?.items.find((r) => r.kind === 'attendance' && r.date === today);

  const done = (msg) => { setModal(null); flash.ok(msg); recs.reload(); info.reload(); };
  async function call(fn, okText, close = true) {
    setBusy(true); flash.clear();
    try { await fn(); if (close) setModal(null); flash.ok(okText); info.reload(); recs.reload(); } catch (e) { flash.err(e); } finally { setBusy(false); }
  }

  return (
    <div>
      <a className="back" href="#/students">‹ الطلاب</a>
      <div className="card">
        <div className="row between"><h2 className="h" style={{ margin: 0 }}>{s.name}</h2>{!active && <span className="tag bad">{STATUS_AR[s.status]}</span>}</div>
        <div className="muted small">
          {s.level?.name || 'بلا مستوى'} · المعلم: {s.teacher.name}{s.age ? ` · ${s.age} سنة` : ''}
        </div>
        {levels.find((l) => l.id === s.level?.id)?.surahs?.length > 0 && <div className="small muted">سور المستوى: {summarizeSurahs(levels.find((l) => l.id === s.level?.id).surahs, SURAHS)}</div>}
        <div className="small">موضع الحفظ: {s.position || '—'}</div>
        {s.notes && <div className="small muted">{s.notes}</div>}
        <div className="row wrap" style={{ marginTop: 10, marginBottom: 0 }}>
          {s.whatsapp && <a className="btn ghost" href={s.whatsapp} target="_blank" rel="noreferrer">واتساب</a>}
          <button className="btn ghost" disabled={!online} onClick={() => setModal({ edit: true, f: { name: s.name, age: s.age ?? '', phone: s.phone, enrolledAt: s.enrolledAt, position: s.position, notes: s.notes } })}>تعديل</button>
          <button className="btn ghost" onClick={() => go('/reports' + qs({ type: 'student', id: s.id }))}>التقرير</button>
          {!isManager && active && <button className="btn ghost" disabled={!online} onClick={() => setModal({ promo: true, note: '' })}>طلب ترقية</button>}
          {isManager && <button className="btn ghost" disabled={!online} onClick={() => setModal({ transfer: true, to: '' })}>نقل</button>}
          {isManager && <button className="btn ghost" disabled={!online} onClick={() => setModal({ level: true, levelId: '', reason: '' })}>المستوى</button>}
          {isManager && <button className="btn ghost" disabled={!online} onClick={() => setModal({ status: true, value: s.status })}>الحالة</button>}
        </div>
      </div>
      {flash.node}

      {active && (
        <div className="card">
          <h3>تسجيل اليوم</h3>
          <div className="muted small">الحضور: {todayAtt ? (todayAtt.status === 'present' ? 'حاضر' : 'غائب') : 'لم يُسجَّل'}</div>
          <div className="row wrap" style={{ marginBottom: 0 }}>
            <button className="btn" disabled={!online} onClick={() => setModal({ kind: 'attendance', rec: todayAtt?.editable ? todayAtt : null })}>الحضور</button>
            <button className="btn" disabled={!online} onClick={() => setModal({ kind: 'hifz' })}>+ حفظ</button>
            <button className="btn" disabled={!online} onClick={() => setModal({ kind: 'review' })}>+ مراجعة</button>
            <button className="btn ghost" disabled={!online} onClick={() => setModal({ kind: 'note' })}>+ ملاحظة</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between"><h3>جدول الحضور</h3><button className="btn ghost" disabled={!online} onClick={() => setModal({ schedule: true, f: { days: s.schedule.days || [], arrivalTime: s.schedule.arrivalTime || '', startTime: s.schedule.startTime || '', endTime: s.schedule.endTime || '', notes: s.schedule.notes || '' } })}>تعديل</button></div>
        <div className="small">الأيام: {s.schedule.days?.length ? s.schedule.days.map((d) => DAYS_AR[d]).join('، ') : 'غير محددة'}</div>
        <div className="small muted">الحضور {s.schedule.arrivalTime || '—'} · التسميع {s.schedule.startTime || '—'} إلى {s.schedule.endTime || '—'}</div>
        {s.schedule.notes && <div className="small muted">{s.schedule.notes}</div>}
      </div>

      <div className="card">
        <h3>السجل {range.from ? `(${range.from} → ${range.to})` : '(آخر 7 أيام)'}</h3>
        <div className="chips">
          {[['all', 'الكل'], ['attendance', 'الحضور'], ['hifz', 'الحفظ'], ['review', 'المراجعة'], ['note', 'الملاحظات']].map(([k, v]) => <button key={k} className={'chip' + (type === k ? ' on' : '')} onClick={() => setType(k)}>{v}</button>)}
          <button className="chip" onClick={() => setModal({ range: true, f: { from: range.from || today, to: range.to || today } })}>فترة أخرى</button>
          {range.from && <button className="chip on" onClick={() => setRange({ from: '', to: '' })}>الأسبوع الأخير ✕</button>}
        </div>
        {recs.loading && <Loading />}
        <ErrorBox text={recs.error} />
        {recs.data?.items.length === 0 && <p className="muted center">لا توجد سجلات في هذه الفترة</p>}
        {recs.data?.items.map((r) => {
          const d = describe(r, scale);
          return (
            <div className="rec" key={r.kind + r.id}>
              <div className="row between" style={{ marginBottom: 2 }}>
                <b className={d.cls ? 'c-' + d.cls : ''}>{d.title}</b>
                <small className="muted">{r.date}</small>
              </div>
              {d.sub && <div className="small">{d.sub}</div>}
              <div className="row between" style={{ marginBottom: 0 }}>
                <small className="muted">{r.by?.name} · {fmtDT(r.at)}</small>
                {r.editable && <button className="btn ghost sm" disabled={!online} onClick={() => setModal({ kind: r.kind === 'recitation' ? r.type : r.kind, rec: r })}>تعديل</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>سجل النقل والمستوى</h3>
        {info.data.transfers.map((t, i) => <div className="small" key={'t' + i}>نقل: {t.from || '—'} ← {t.to} <span className="muted">· {fmtDT(t.at)}</span></div>)}
        {info.data.levelChanges.map((c, i) => <div className="small" key={'l' + i}>{LVL_AR[c.type]}: {c.from || '—'} ← {c.to} {c.reason && `(${c.reason})`} <span className="muted">· {fmtDT(c.at)}</span></div>)}
        {!info.data.transfers.length && !info.data.levelChanges.length && <p className="muted small">لا يوجد</p>}
      </div>

      {modal?.kind && <RecordForm studentId={id} kind={modal.kind} rec={modal.rec} scale={scale} levelSurahs={levels.find((l) => l.id === s.level?.id)?.surahs || []} onDone={done} onClose={() => setModal(null)} />}

      {modal?.edit && (
        <Modal title="تعديل بيانات الطالب" onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call(() => api('/students/' + id, { method: 'PATCH', body: isManager ? modal.f : { position: modal.f.position, notes: modal.f.notes } }), 'تم حفظ التعديل'); }}>
            {isManager && <>
              <label>الاسم<input value={modal.f.name} onChange={(e) => setModal({ ...modal, f: { ...modal.f, name: e.target.value } })} required /></label>
              <label>العمر<input type="number" min="3" max="100" value={modal.f.age} onChange={(e) => setModal({ ...modal, f: { ...modal.f, age: e.target.value } })} /></label>
              <label>الهاتف<input dir="ltr" value={modal.f.phone} onChange={(e) => setModal({ ...modal, f: { ...modal.f, phone: e.target.value } })} /></label>
              <label>تاريخ الالتحاق<input type="date" value={modal.f.enrolledAt} onChange={(e) => setModal({ ...modal, f: { ...modal.f, enrolledAt: e.target.value } })} /></label>
            </>}
            <label>موضع الحفظ<input value={modal.f.position} onChange={(e) => setModal({ ...modal, f: { ...modal.f, position: e.target.value } })} /></label>
            <label>ملاحظات<input value={modal.f.notes} onChange={(e) => setModal({ ...modal, f: { ...modal.f, notes: e.target.value } })} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}

      {modal?.schedule && (
        <Modal title="جدول الحضور" onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call(() => api(`/students/${id}/schedule`, { method: 'PUT', body: modal.f }), 'تم حفظ الجدول'); }}>
            <div className="chips">
              {DAYS_AR.map((d, i) => <button type="button" key={i} className={'chip' + (modal.f.days.includes(i) ? ' on' : '')} onClick={() => setModal({ ...modal, f: { ...modal.f, days: modal.f.days.includes(i) ? modal.f.days.filter((x) => x !== i) : [...modal.f.days, i] } })}>{d}</button>)}
            </div>
            <label>وقت الحضور<input type="time" value={modal.f.arrivalTime} onChange={(e) => setModal({ ...modal, f: { ...modal.f, arrivalTime: e.target.value } })} /></label>
            <div className="row">
              <label className="grow">بداية التسميع<input type="time" value={modal.f.startTime} onChange={(e) => setModal({ ...modal, f: { ...modal.f, startTime: e.target.value } })} /></label>
              <label className="grow">نهاية التسميع<input type="time" value={modal.f.endTime} onChange={(e) => setModal({ ...modal, f: { ...modal.f, endTime: e.target.value } })} /></label>
            </div>
            <label>ملاحظات<input value={modal.f.notes} onChange={(e) => setModal({ ...modal, f: { ...modal.f, notes: e.target.value } })} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}

      {modal?.range && (
        <Modal title="عرض فترة" onClose={() => setModal(null)}>
          <label>من<input type="date" max={today} value={modal.f.from} onChange={(e) => setModal({ ...modal, f: { ...modal.f, from: e.target.value } })} /></label>
          <label>إلى<input type="date" max={today} value={modal.f.to} onChange={(e) => setModal({ ...modal, f: { ...modal.f, to: e.target.value } })} /></label>
          <button className="btn block" onClick={() => { setRange(modal.f); setModal(null); }}>عرض</button>
        </Modal>
      )}

      {modal?.transfer && (
        <Modal title="نقل الطالب" onClose={() => setModal(null)}>
          <label>المعلم الجديد<select value={modal.to} onChange={(e) => setModal({ ...modal, to: e.target.value })}><option value="">اختر المعلم</option>{teachers.filter((t) => t.id !== s.teacher.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {modal.to && <p className="small muted">سيُنقل {s.name} من «{s.teacher.name}» إلى «{teachers.find((t) => t.id === modal.to)?.name}». تبقى السجلات السابقة كما هي.</p>}
          <button className="btn block" disabled={busy || !modal.to} onClick={() => call(() => api('/transfers', { method: 'POST', body: { studentIds: [id], toTeacherId: modal.to } }), 'تم النقل')}>تأكيد النقل</button>
        </Modal>
      )}

      {modal?.level && (
        <Modal title="تغيير المستوى" onClose={() => setModal(null)}>
          <label>المستوى الجديد<select value={modal.levelId} onChange={(e) => setModal({ ...modal, levelId: e.target.value })}><option value="">اختر</option>{levels.filter((l) => l.id !== s.level?.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>السبب (إلزامي عند الخفض)<input value={modal.reason} onChange={(e) => setModal({ ...modal, reason: e.target.value })} /></label>
          <button className="btn block" disabled={busy || !modal.levelId} onClick={() => call(() => api(`/students/${id}/level`, { method: 'POST', body: { levelId: modal.levelId, reason: modal.reason } }), 'تم تغيير المستوى')}>حفظ</button>
        </Modal>
      )}

      {modal?.status && (
        <Modal title="حالة الطالب" onClose={() => setModal(null)}>
          <label>الحالة<select value={modal.value} onChange={(e) => setModal({ ...modal, value: e.target.value })}><option value="active">نشط</option><option value="paused">متوقف مؤقتاً</option><option value="archived">مؤرشف</option></select></label>
          <p className="small muted">لا تُحذف أي سجلات عند الأرشفة، ويمكن إعادة التنشيط لاحقاً.</p>
          <button className="btn block" disabled={busy} onClick={() => call(() => api(`/students/${id}/status`, { method: 'POST', body: { status: modal.value } }), 'تم تغيير الحالة')}>حفظ</button>
        </Modal>
      )}

      {modal?.promo && (
        <Modal title="طلب ترقية" onClose={() => setModal(null)}>
          <p className="small muted">سيُرفع الطلب إلى المشرف مع ملخص آخر 30 يوماً من حضور الطالب وتقييماته.</p>
          <label>ملاحظتك (اختياري)<textarea rows="3" value={modal.note} onChange={(e) => setModal({ ...modal, note: e.target.value })} /></label>
          <button className="btn block" disabled={busy} onClick={() => call(() => api('/promotions', { method: 'POST', body: { studentId: id, note: modal.note } }), 'تم رفع طلب الترقية')}>رفع الطلب</button>
        </Modal>
      )}
    </div>
  );
}
