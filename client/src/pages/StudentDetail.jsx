import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SURAHS } from '../quran.js';
import { QuranReader } from '../quranReader.jsx';
import { CAT_AR, DAYS_AR, ErrorBox, IconBtn, Loading, Modal, Progress, STATUS_AR, fmtDT, fmtTime, go, goalText, gradeLabel, qs, todayStr, useFlash, useLoad, useSettings } from '../ui.jsx';

const LVL_AR = { assign: 'تعيين', promotion: 'ترقية', demotion: 'خفض' };

function describe(r, scale) {
  if (r.kind === 'attendance') return { title: r.status === 'present' ? 'حاضر' : 'غائب', sub: r.note, cls: r.status === 'present' ? 'ok' : 'bad' };
  if (r.kind === 'note') return { title: `ملاحظة · ${CAT_AR[r.category]}`, sub: r.text };
  const what = r.type === 'hifz' ? 'حفظ' : 'مراجعة';
  const where = r.mode === 'surah' ? `${r.surahName} (${r.fromAyah}–${r.toAyah})` : `صفحة ${r.fromPage}–${r.toPage}`;
  return { title: `${what} · ${where}`, sub: r.grade ? `التقييم: ${gradeLabel(scale, r.grade)}` : 'بلا تقييم' };
}

// نموذج واحد للإضافة والتعديل: attendance | hifz | review | note (لتسجيل/مستوى محدد)
function RecordForm({ enrollmentId, kind, rec, onDone, onClose, scale, levelSurahs = [] }) {
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
      else await api(`/enrollments/${enrollmentId}/${path}`, { method: 'POST', body });
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
            <label>السورة<select value={f.surah} onChange={set('surah')}>
              {levelSurahs.length > 0 && <optgroup label="سور هذا المستوى">{levelSurahs.map((n) => <option key={'l' + n} value={n}>{n}. {SURAHS[n - 1].name} ({SURAHS[n - 1].ayahs} آية)</option>)}</optgroup>}
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
        {err && <div className="alert">{err}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
      </form>
    </Modal>
  );
}

export default function StudentDetail({ id, me, online }) {
  const { gradeScale: scale } = useSettings();
  const isManager = me.role !== 'teacher';
  const [eid, setEid] = useState(null);
  const [type, setType] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [modal, setModal] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const info = useLoad(() => api('/students/' + id), [id]);
  const enrollments = info.data?.enrollments || [];
  const cur = enrollments.find((e) => e.id === eid) || enrollments.find((e) => e.status === 'active') || enrollments[0];
  const curId = cur?.id;
  const recs = useLoad(() => (curId ? api(`/students/${id}/records` + qs({ enrollmentId: curId, type, from: range.from, to: range.to })) : Promise.resolve({ items: [] })), [id, curId, type, range.from, range.to]);

  useEffect(() => {
    if (isManager) api('/users?role=teacher&status=active&limit=50').then((d) => setTeachers(d.items)).catch(() => {});
    api('/levels').then((d) => setLevels(d.items)).catch(() => {});
  }, [isManager]);

  if (info.loading) return <Loading />;
  if (info.error) return <div><ErrorBox text={info.error} /><a className="btn ghost" href="#/students">رجوع</a></div>;
  const s = info.data.student;
  const today = todayStr();
  const active = s.status === 'active' && cur?.status === 'active';
  const todayAtt = recs.data?.items.find((r) => r.kind === 'attendance' && r.date === today);
  const levelSurahs = levels.find((l) => l.id === cur?.level?.id)?.surahs || [];
  const takenLevels = new Set(enrollments.filter((e) => e.status === 'active').map((e) => e.level?.id));
  const refresh = () => { info.reload(); recs.reload(); };
  const done = (msg) => { setModal(null); flash.ok(msg); refresh(); };
  async function call(fn, okText) {
    setBusy(true); flash.clear();
    try { await fn(); setModal(null); flash.ok(okText); refresh(); } catch (e) { flash.err(e); } finally { setBusy(false); }
  }
  const lvName = (e) => e.level?.name || 'بلا مستوى';

  return (
    <div>
      <a className="back" href="#/students">‹ الطلاب</a>
      <div className="card">
        <div className="row between"><h2 className="h" style={{ margin: 0 }}>{s.name}</h2>{s.status !== 'active' && <span className="tag bad">{STATUS_AR[s.status]}</span>}</div>
        <div className="muted small">{s.age ? `${s.age} سنة · ` : ''}التحق في {s.enrolledAt}</div>
        {isManager && s.notes && <div className="small muted">{s.notes}</div>}
        {info.data.groups.length > 0 && <div className="metas" style={{ marginTop: 6 }}>{info.data.groups.map((g) => <a key={g.id} className="goal" href={'#/groups/' + g.id} title={goalText(g)}>{g.name}</a>)}</div>}
        <div className="irow" style={{ marginTop: 10 }}>
          {s.whatsapp && <IconBtn icon="chat" tone="wa" label="واتساب" href={s.whatsapp} />}
          {isManager && <IconBtn icon="user" label="تعديل بيانات الطالب" disabled={!online} onClick={() => setModal({ editS: true, f: { name: s.name, age: s.age ?? '', phone: s.phone, enrolledAt: s.enrolledAt, notes: s.notes } })} />}
          <IconBtn icon="file" tone="gold" label="تقرير الطالب" onClick={() => go('/reports' + qs({ type: 'student', id: s.id }))} />
          {isManager && <IconBtn icon="plus" tone="ok" caption="مستوى" label="تسجيل الطالب في مستوى إضافي" disabled={!online} onClick={() => setModal({ addE: true, f: { levelId: '', teacherId: '', position: '' } })} />}
          {isManager && <IconBtn icon="power" tone="danger" label="حالة الطالب (إيقاف/أرشفة)" disabled={!online} onClick={() => setModal({ sstatus: true, value: s.status })} />}
        </div>
      </div>
      {flash.node}

      {enrollments.length === 0 && <p className="muted center">لا توجد تسجيلات ظاهرة لك</p>}
      {enrollments.length > 0 && (
        <div className="chips">
          {enrollments.map((e) => <button key={e.id} className={'chip' + (e.id === curId ? ' on' : '')} onClick={() => setEid(e.id)}>{lvName(e)}{e.status !== 'active' ? ' (منتهٍ)' : ''}</button>)}
        </div>
      )}

      {cur && (
        <>
          <div className="card">
            <h3>{lvName(cur)}{cur.status !== 'active' && <span className="tag bad" style={{ marginInlineStart: 8 }}>منتهٍ</span>}</h3>
            <div className="small">المعلم: {cur.teacher.name || '—'}</div>
            <div className="small">موضع الحفظ: {cur.position || '—'}</div>
            {cur.notes && <div className="small muted">{cur.notes}</div>}
            <div className="small" style={{ marginTop: 6 }}>الأيام: {cur.schedule.days?.length ? cur.schedule.days.map((d) => DAYS_AR[d]).join('، ') : 'غير محددة'}</div>
            <div className="small muted">الحضور {fmtTime(cur.schedule.arrivalTime) || '—'} · التسميع {fmtTime(cur.schedule.startTime) || '—'} إلى {fmtTime(cur.schedule.endTime) || '—'}</div>
            {cur.schedule.notes && <div className="small muted">{cur.schedule.notes}</div>}
            <div className="irow" style={{ marginTop: 10 }}>
              <IconBtn icon="edit" label="موضع الحفظ وملاحظات هذا المستوى" disabled={!online} onClick={() => setModal({ editE: true, f: { position: cur.position, notes: cur.notes } })} />
              <IconBtn icon="clock" label="جدول الحضور لهذا المستوى" disabled={!online} onClick={() => setModal({ schedule: true, f: { days: cur.schedule.days || [], arrivalTime: cur.schedule.arrivalTime || '', startTime: cur.schedule.startTime || '', endTime: cur.schedule.endTime || '', notes: cur.schedule.notes || '' } })} />
              {!isManager && active && <IconBtn icon="arrowup" label="طلب ترقية" disabled={!online} onClick={() => setModal({ promo: true, note: '' })} />}
              {isManager && <IconBtn icon="repeat" label="نقل هذا المستوى إلى معلم آخر" disabled={!online || cur.status !== 'active'} onClick={() => setModal({ transfer: true, to: '' })} />}
              {isManager && <IconBtn icon="layers" label="تغيير المستوى" disabled={!online || cur.status !== 'active'} onClick={() => setModal({ level: true, levelId: '', reason: '' })} />}
              {isManager && <IconBtn icon="power" tone={cur.status === 'active' ? 'danger' : 'ok'} label={cur.status === 'active' ? 'إنهاء التسجيل في هذا المستوى' : 'إعادة تفعيل التسجيل'} disabled={!online} onClick={() => setModal({ estatus: true })} />}
            </div>
          </div>

          {cur.progress && (
            <div className="card">
              <h3>تقدّم الطالب في {lvName(cur)}</h3>
              <Progress pct={cur.progress.pct} label={`${cur.progress.pct}% — حفظ ${cur.progress.memorized} من ${cur.progress.total} آية من سور المستوى`} />
              <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
                {cur.progress.surahs.map((x) => (
                  <button key={x.surah} className={'chip' + (x.memorized === x.total ? ' on' : '')} title={`${x.memorized} من ${x.total} — اضغط لعرض السورة`} onClick={() => setModal({ reader: { surah: x.surah, ranges: x.ranges || [], legend: 'الآيات المحفوظة' } })}>{x.name}{x.memorized === x.total ? ' ✓' : x.memorized ? ` ${Math.round((x.memorized / x.total) * 100)}%` : ''}</button>
                ))}
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>يُحسب من سجلات «الحفظ» بالسورة والآيات في هذا المستوى (التقييم «يحتاج إلى إعادة» لا يُحتسب، والتسميع بالصفحات غير داخل في الحساب).</p>
            </div>
          )}

          {active && (
            <div className="card">
              <h3>تسجيل اليوم — {lvName(cur)}</h3>
              <div className="muted small">الحضور: {todayAtt ? (todayAtt.status === 'present' ? 'حاضر' : 'غائب') : 'لم يُسجَّل'}</div>
              <div className="irow">
                <IconBtn icon="check" tone="ok" caption="الحضور" label="تسجيل الحضور" disabled={!online} onClick={() => setModal({ kind: 'attendance', rec: todayAtt?.editable ? todayAtt : null })} />
                <IconBtn icon="book" tone="ok" caption="حفظ" label="إضافة حفظ" disabled={!online} onClick={() => setModal({ kind: 'hifz' })} />
                <IconBtn icon="restore" tone="ok" caption="مراجعة" label="إضافة مراجعة" disabled={!online} onClick={() => setModal({ kind: 'review' })} />
                <IconBtn icon="file" tone="gold" caption="ملاحظة" label="إضافة ملاحظة" disabled={!online} onClick={() => setModal({ kind: 'note' })} />
              </div>
            </div>
          )}

          <div className="card">
            <h3>السجل {range.from ? `(${range.from} → ${range.to})` : '(آخر 7 أيام)'} — {lvName(cur)}</h3>
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
 <span className="irow">
                      {r.kind === 'recitation' && r.mode === 'surah' && <IconBtn icon="book" tone="ok" label="عرض السورة مع تظليل المقطع" onClick={() => setModal({ reader: { surah: r.surah, ranges: [[r.fromAyah, r.toAyah]], legend: 'المقطع المسمَّع' } })} />}
                    {r.editable && <IconBtn icon="edit" label="تعديل السجل" disabled={!online} onClick={() => setModal({ kind: r.kind === 'recitation' ? r.type : r.kind, rec: r })} />}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="card">
        <h3>سجل النقل والمستوى</h3>
        {info.data.transfers.map((t, i) => <div className="small" key={'t' + i}>نقل ({t.level || 'بلا مستوى'}): {t.from || '—'} ← {t.to} <span className="muted">· {fmtDT(t.at)}</span></div>)}
        {info.data.levelChanges.map((c, i) => <div className="small" key={'l' + i}>{LVL_AR[c.type]}: {c.from || '—'} ← {c.to} {c.reason && `(${c.reason})`} <span className="muted">· {fmtDT(c.at)}</span></div>)}
        {!info.data.transfers.length && !info.data.levelChanges.length && <p className="muted small">لا يوجد</p>}
      </div>

      {modal?.reader && <QuranReader {...modal.reader} onClose={() => setModal(null)} />}
      {modal?.kind && cur && <RecordForm enrollmentId={cur.id} kind={modal.kind} rec={modal.rec} scale={scale} levelSurahs={levelSurahs} onDone={done} onClose={() => setModal(null)} />}

      {modal?.editS && (
        <Modal title="تعديل بيانات الطالب" onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call(() => api('/students/' + id, { method: 'PATCH', body: modal.f }), 'تم حفظ التعديل'); }}>
            <label>الاسم<input value={modal.f.name} onChange={(e) => setModal({ ...modal, f: { ...modal.f, name: e.target.value } })} required /></label>
            <label>العمر<input type="number" min="3" max="100" value={modal.f.age} onChange={(e) => setModal({ ...modal, f: { ...modal.f, age: e.target.value } })} /></label>
            <label>الهاتف<input dir="ltr" value={modal.f.phone} onChange={(e) => setModal({ ...modal, f: { ...modal.f, phone: e.target.value } })} /></label>
            <label>تاريخ الالتحاق<input type="date" value={modal.f.enrolledAt} onChange={(e) => setModal({ ...modal, f: { ...modal.f, enrolledAt: e.target.value } })} /></label>
            <label>ملاحظات عامة<input value={modal.f.notes} onChange={(e) => setModal({ ...modal, f: { ...modal.f, notes: e.target.value } })} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}

      {modal?.editE && cur && (
        <Modal title={`موضع الحفظ — ${lvName(cur)}`} onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call(() => api('/enrollments/' + cur.id, { method: 'PATCH', body: modal.f }), 'تم حفظ التعديل'); }}>
            <label>موضع الحفظ<input value={modal.f.position} onChange={(e) => setModal({ ...modal, f: { ...modal.f, position: e.target.value } })} /></label>
            <label>ملاحظات هذا المستوى<input value={modal.f.notes} onChange={(e) => setModal({ ...modal, f: { ...modal.f, notes: e.target.value } })} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}

      {modal?.schedule && cur && (
        <Modal title={`جدول الحضور — ${lvName(cur)}`} onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call(() => api(`/enrollments/${cur.id}/schedule`, { method: 'PUT', body: modal.f }), 'تم حفظ الجدول'); }}>
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

      {modal?.addE && (
        <Modal title="تسجيل في مستوى إضافي" onClose={() => setModal(null)}>
          <p className="small muted">سيكون للتسجيل الجديد معلمه وحضوره وسجلاته المستقلة.</p>
          <label>المستوى<select value={modal.f.levelId} onChange={(e) => setModal({ ...modal, f: { ...modal.f, levelId: e.target.value } })}><option value="">اختر المستوى</option>{levels.filter((l) => !takenLevels.has(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>المعلم<select value={modal.f.teacherId} onChange={(e) => setModal({ ...modal, f: { ...modal.f, teacherId: e.target.value } })}><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label>موضع الحفظ (اختياري)<input value={modal.f.position} onChange={(e) => setModal({ ...modal, f: { ...modal.f, position: e.target.value } })} /></label>
          <button className="btn block" disabled={busy || !modal.f.levelId || !modal.f.teacherId} onClick={() => call(() => api(`/students/${id}/enrollments`, { method: 'POST', body: modal.f }), 'تم تسجيل الطالب في المستوى')}>تسجيل</button>
        </Modal>
      )}

      {modal?.transfer && cur && (
        <Modal title={`نقل ${lvName(cur)} إلى معلم آخر`} onClose={() => setModal(null)}>
          <label>المعلم الجديد<select value={modal.to} onChange={(e) => setModal({ ...modal, to: e.target.value })}><option value="">اختر المعلم</option>{teachers.filter((t) => t.id !== cur.teacher.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {modal.to && <p className="small muted">سيُنقل مستوى «{lvName(cur)}» فقط من «{cur.teacher.name}» إلى «{teachers.find((t) => t.id === modal.to)?.name}». بقية مستويات الطالب تبقى عند معلميها، وتبقى السجلات السابقة كما هي.</p>}
          <button className="btn block" disabled={busy || !modal.to} onClick={() => call(() => api('/transfers', { method: 'POST', body: { enrollmentIds: [cur.id], toTeacherId: modal.to } }), 'تم النقل')}>تأكيد النقل</button>
        </Modal>
      )}

      {modal?.level && cur && (
        <Modal title={`تغيير مستوى ${lvName(cur)}`} onClose={() => setModal(null)}>
          <label>المستوى الجديد<select value={modal.levelId} onChange={(e) => setModal({ ...modal, levelId: e.target.value })}><option value="">اختر</option>{levels.filter((l) => l.id !== cur.level?.id && !takenLevels.has(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>السبب (إلزامي عند الخفض)<input value={modal.reason} onChange={(e) => setModal({ ...modal, reason: e.target.value })} /></label>
          <button className="btn block" disabled={busy || !modal.levelId} onClick={() => call(() => api(`/enrollments/${cur.id}/level`, { method: 'POST', body: { levelId: modal.levelId, reason: modal.reason } }), 'تم تغيير المستوى')}>حفظ</button>
        </Modal>
      )}

      {modal?.estatus && cur && (
        <Modal title={cur.status === 'active' ? 'إنهاء التسجيل في المستوى' : 'إعادة تفعيل التسجيل'} onClose={() => setModal(null)}>
          <p className="small muted">{cur.status === 'active' ? `سينتهي تسجيل الطالب في «${lvName(cur)}» وتبقى كل سجلاته وتقاريره. لا يمكن إنهاء آخر تسجيل نشط (استخدم حالة الطالب).` : `سيعود تسجيل الطالب في «${lvName(cur)}» نشطاً.`}</p>
          <button className="btn block" disabled={busy} onClick={() => call(() => api(`/enrollments/${cur.id}/status`, { method: 'POST', body: { status: cur.status === 'active' ? 'ended' : 'active' } }), 'تم التحديث')}>تأكيد</button>
        </Modal>
      )}

      {modal?.sstatus && (
        <Modal title="حالة الطالب" onClose={() => setModal(null)}>
          <label>الحالة<select value={modal.value} onChange={(e) => setModal({ ...modal, value: e.target.value })}><option value="active">نشط</option><option value="paused">متوقف مؤقتاً</option><option value="archived">مؤرشف</option></select></label>
          <p className="small muted">لا تُحذف أي سجلات عند الأرشفة، ويمكن إعادة التنشيط لاحقاً. يسري على كل مستويات الطالب.</p>
          <button className="btn block" disabled={busy} onClick={() => call(() => api(`/students/${id}/status`, { method: 'POST', body: { status: modal.value } }), 'تم تغيير الحالة')}>حفظ</button>
        </Modal>
      )}

      {modal?.promo && cur && (
        <Modal title={`طلب ترقية — ${lvName(cur)}`} onClose={() => setModal(null)}>
          <p className="small muted">سيُرفع الطلب إلى المشرف مع ملخص آخر 30 يوماً من حضور الطالب وتقييماته في هذا المستوى.</p>
          <label>ملاحظتك (اختياري)<textarea rows="3" value={modal.note} onChange={(e) => setModal({ ...modal, note: e.target.value })} /></label>
          <button className="btn block" disabled={busy} onClick={() => call(() => api('/promotions', { method: 'POST', body: { enrollmentId: cur.id, note: modal.note } }), 'تم رفع طلب الترقية')}>رفع الطلب</button>
        </Modal>
      )}
    </div>
  );
}
