import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Empty, FILTER_AR, Icon, IconBtn, Loading, Modal, Progress, STATUS_AR, fmtTime, go, initial, loadPageState, qs, savePageState, todayStr, useFlash, useSettings } from '../ui.jsx';

const blank = { name: '', age: '', phone: '', enrolledAt: todayStr(), teacherId: '', levelId: '', position: '', notes: '' };

// بطاقة لكل طالب تضم تسجيلاته (مستوياته). الحضور والتحديد على مستوى التسجيل.
// embedded: تُستخدم داخل صفحة المعلم (الفلاتر محلية ولا تغيّر العنوان)
export default function Students({ me, online, query, embedded = false, onFilter }) {
  const isManager = me.role !== 'teacher';
  const { teachersCanAddStudents } = useSettings();
  const canAdd = isManager || !!teachersCanAddStudents;
  const myLevels = (me.levelIds || []).map(String);
  const saved = loadPageState('students') || {}; // عند الرجوع: نص البحث وعدد ما عُرض
  const [q, setQ] = useState(saved.q || '');
  const [page, setPage] = useState(1);
  const restoreN = useRef(saved.n > 1 ? saved.n : 1);
  const [data, setData] = useState({ items: null, total: 0, pages: 1 });
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [sel, setSel] = useState(new Set()); // معرّفات التسجيلات المحددة
  const [form, setForm] = useState(null);
  const [editS, setEditS] = useState(null); // تعديل بيانات الطالب (للمشرف)
  const [editE, setEditE] = useState(null); // تعديل موضع الحفظ/ملاحظات تسجيل
  const [move, setMove] = useState(null);
  const [grp, setGrp] = useState(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const key = JSON.stringify(query);

  useEffect(() => {
    if (isManager) api('/users?role=teacher&status=active&limit=50').then((d) => setTeachers(d.items)).catch(() => {});
    api('/levels').then((d) => setLevels(d.items)).catch(() => {});
  }, [isManager]);

  const load = useCallback(async (p = 1, append = false) => {
    try {
      const n = !append && p === 1 ? restoreN.current : 1;
      restoreN.current = 1;
      const d = await api('/students' + qs({ ...query, q, page: append ? p : 1, limit: append ? 30 : Math.min(100, 30 * n) }));
      setData((cur) => ({ ...d, items: append ? [...(cur.items || []), ...d.items] : d.items }));
      setPage(append ? p : n);
    } catch (e) { flash.err(e); setData((c) => ({ ...c, items: c.items || [] })); }
  }, [key, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(new Set()); const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);

  useEffect(() => { savePageState('students', { q, n: page }); }, [q, page]);
  const setFilter = (k, v) => (onFilter ? onFilter(k, v) : go('/students' + qs({ ...query, [k]: v })));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const items = data.items;
  const patchEnr = (ids, status) => setData((d) => ({ ...d, items: d.items.map((s) => ({ ...s, enrollments: s.enrollments.map((e) => (ids.has(e.id) ? { ...e, today: status } : e)) })) }));

  async function mark(e, status) {
    try {
      await api(`/enrollments/${e.id}/attendance`, { method: 'POST', body: { status } });
      patchEnr(new Set([e.id]), status); // بعد تأكيد الخادم
    } catch (er) { flash.err(er); }
  }
  async function bulk(status) {
    setBusy(true); flash.clear();
    try {
      const r = await api('/attendance/bulk', { method: 'POST', body: { enrollmentIds: [...sel], status } });
      patchEnr(new Set(r.done), status);
      let msg = `تم تسجيل ${status === 'present' ? 'حضور' : 'غياب'} ${r.done.length} تسجيل`;
      if (r.skipped.length) msg += ` — تعذّر ${r.skipped.length} (سجلهم لمعلم آخر): ${r.skipped.slice(0, 3).join('، ')}`;
      flash.ok(msg); setSel(new Set());
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function create(e) {
    e.preventDefault(); setBusy(true);
    try { await api('/students', { method: 'POST', body: form }); flash.ok('تمت إضافة الطالب'); setForm(null); load(1); } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function saveStudent(e) {
    e.preventDefault(); setBusy(true);
    try {
      const { id, name, age, phone, enrolledAt, notes } = editS;
      await api('/students/' + id, { method: 'PATCH', body: { name, age, phone, enrolledAt, notes } });
      flash.ok('تم حفظ التعديل'); setEditS(null); load(1);
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function saveEnrollment(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/enrollments/' + editE.id, { method: 'PATCH', body: { position: editE.position, notes: editE.notes } });
      flash.ok('تم حفظ التعديل'); setEditE(null); load(1);
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function doMove() {
    setBusy(true);
    try {
      const r = await api('/transfers', { method: 'POST', body: { enrollmentIds: [...sel], toTeacherId: move.to } });
      flash.ok(`تم نقل ${r.moved} تسجيل` + (r.skipped ? ` (تجاوز ${r.skipped} عند المعلم نفسه)` : ''));
      setMove(null); setSel(new Set()); load(1);
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function openGroups() {
    try { setGrp({ list: (await api('/groups')).items, id: '' }); } catch (e) { flash.err(e); }
  }
  async function addToGroup() {
    setBusy(true);
    try {
      const studentIds = [...new Set(selected.map((x) => x.student.id))];
      const r = await api(`/groups/${grp.id}/members`, { method: 'POST', body: { add: studentIds } });
      flash.ok(`تمت إضافة ${studentIds.length} طالب. عدد طلاب المجموعة الآن ${r.studentCount}`);
      setGrp(null); setSel(new Set());
    } catch (e) { flash.err(e); } finally { setBusy(false); }
  }
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const markable = (s, e) => s.status === 'active' && e.status === 'active';
  const allEnr = (items || []).flatMap((s) => s.enrollments.filter((e) => markable(s, e)).map((e) => ({ ...e, student: s })));
  const selected = allEnr.filter((e) => sel.has(e.id));
  const allOn = allEnr.length > 0 && allEnr.every((e) => sel.has(e.id));
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name;

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="بحث بالاسم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
        {canAdd && <IconBtn icon="plus" label="إضافة طالب" caption="طالب" tone="on" disabled={!online} onClick={() => setForm({ ...blank, teacherId: embedded ? query.teacherId : '' })} />}
      </div>

      <div className="chips">
        {query.filter && <button className="chip on" onClick={() => setFilter('filter', '')}>{FILTER_AR[query.filter]} ✕</button>}
        <button className={'chip' + (query.today === '1' ? ' on' : '')} onClick={() => setFilter('today', query.today === '1' ? '' : '1')}>موعدهم اليوم</button>
        {isManager && !embedded && !query.filter && <button className="chip" onClick={() => setFilter('filter', 'no_active')}>بلا تسجيل نشط</button>}
        <select className="chip" value={query.status || 'active'} onChange={(e) => setFilter('status', e.target.value === 'active' ? '' : e.target.value)}>
          <option value="active">النشطون</option><option value="paused">المتوقفون</option><option value="archived">المؤرشفون</option><option value="all">الكل</option>
        </select>
        <select className="chip" value={query.levelId || ''} onChange={(e) => setFilter('levelId', e.target.value)}>
          <option value="">كل المستويات</option><option value="none">بلا مستوى</option>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {isManager && !embedded && (
          <select className="chip" value={query.teacherId || ''} onChange={(e) => setFilter('teacherId', e.target.value)}>
            <option value="">كل المعلمين</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {flash.node}

      {allEnr.length > 0 && (
        <div className={sel.size ? 'bulkbar' : 'row'}>
          <div className="irow">
            <IconBtn icon="check" tone="sel" on={allOn} label="تحديد الكل" caption={allOn ? 'إلغاء الكل' : 'تحديد الكل'} onClick={() => setSel(allOn ? new Set() : new Set(allEnr.map((e) => e.id)))} />
            {sel.size > 0 && <span>{sel.size} محدد</span>}
          </div>
          {sel.size > 0 && (
            <div className="irow">
              <IconBtn icon="check" tone="ok" caption="تحضير" label="تحضير المحدد حاضرين" disabled={!online || busy} onClick={() => bulk('present')} />
              <IconBtn icon="x" tone="danger" caption="غياب" label="تسجيل المحدد غائبين" disabled={!online || busy} onClick={() => bulk('absent')} />
              {isManager && <IconBtn icon="repeat" label="نقل المحدد" caption="نقل" disabled={!online} onClick={() => setMove({ to: '' })} />}
              {isManager && <IconBtn icon="grid" label="إضافة المحدد إلى مجموعة" caption="مجموعة" disabled={!online} onClick={openGroups} />}
            </div>
          )}
        </div>
      )}

      {items === null && <Loading />}
      {items?.length === 0 && <Empty text="لا يوجد طلاب مطابقون" />}
      {items?.map((s) => (
        <div className="card scard" key={s.id}>
          <div className="sc-head">
            <div className="avatar">{initial(s.name)}</div>
            <a className="name" href={'#/students/' + s.id}>{s.name}</a>
            {s.status !== 'active' && <span className="tag bad">{STATUS_AR[s.status]}</span>}
          </div>

          {s.enrollments.length === 0 && (isManager
            ? <div className="small"><span className="tag warn">بلا تسجيل نشط</span> <span className="muted">افتح ملفه واضغط «مستوى» لتسجيله من جديد.</span></div>
            : <div className="small muted">لا توجد تسجيلات ظاهرة لك</div>)}
          {s.enrollments.map((e) => (
            <div className="enr" key={e.id}>
              <div className="metas">
                <span className="m"><Icon name="layers" size={14} />{e.level?.name || 'بلا مستوى'}</span>
                {isManager && !embedded && <span className="m"><Icon name="user" size={14} />{e.teacher.name || '—'}</span>}
                {e.schedule?.arrivalTime && <span className="m"><Icon name="clock" size={14} />يحضر {fmtTime(e.schedule.arrivalTime)}</span>}
                {e.status !== 'active' && <span className="tag bad">منتهٍ</span>}
              </div>
              {e.progress && <Progress thin pct={e.progress.pct} label={`تقدّم ${e.level?.name}: ${e.progress.pct}% (${e.progress.memorized} من ${e.progress.total} آية)`} />}
              <div className="irow">
                {markable(s, e) && <IconBtn icon="check" tone="sel" on={sel.has(e.id)} label="تحديد" onClick={() => toggleSel(e.id)} />}
                {markable(s, e) && <IconBtn icon="check" tone={e.today === 'present' ? 'on' : 'ok'} on={e.today === 'present'} caption="حاضر" label="تسجيل حضور" disabled={!online} onClick={() => mark(e, 'present')} />}
                {markable(s, e) && <IconBtn icon="x" tone={e.today === 'absent' ? 'bad on' : 'danger'} on={e.today === 'absent'} caption="غائب" label="تسجيل غياب" disabled={!online} onClick={() => mark(e, 'absent')} />}
                <IconBtn icon="edit" label="موضع الحفظ وملاحظات هذا المستوى" disabled={!online} onClick={() => setEditE({ id: e.id, name: s.name, level: e.level?.name, position: e.position, notes: e.notes })} />
              </div>
            </div>
          ))}

          <div className="irow">
            <IconBtn icon="file" label="ملف الطالب" caption="الملف" href={'#/students/' + s.id} />
            {s.whatsapp && <IconBtn icon="chat" tone="wa" label="واتساب" href={s.whatsapp} />}
            {isManager && <IconBtn icon="user" label="تعديل بيانات الطالب" disabled={!online} onClick={() => setEditS({ id: s.id, name: s.name, age: s.age ?? '', phone: s.phone, enrolledAt: s.enrolledAt, notes: s.notes })} />}
          </div>
        </div>
      ))}
      {items && items.length < data.total && <button className="btn ghost block" onClick={() => load(page + 1, true)}>عرض المزيد ({data.total - items.length} متبقٍ)</button>}

      {form && (
        <Modal title="طالب جديد" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            <label>الاسم<input value={form.name} onChange={set('name')} required /></label>
            {isManager ? (
              <label>المعلم<select value={form.teacherId} onChange={set('teacherId')} required><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            ) : <p className="small muted">سيُسجَّل الطالب عندك.</p>}
            <label>المستوى<select value={form.levelId} onChange={set('levelId')}><option value="">بلا مستوى</option>{(isManager ? levels : levels.filter((l) => myLevels.includes(String(l.id)))).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>العمر<input type="number" inputMode="numeric" min="3" max="100" value={form.age} onChange={set('age')} /></label>
            <label>رقم الهاتف (اختياري)<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX أو 7XXXXXXXX أو +20…" value={form.phone} onChange={set('phone')} /><small className="small muted">سعودي: 05XXXXXXXX · يمني: 7XXXXXXXX · غيرهما: مع مفتاح الدولة مثل +20…</small></label>
            <label>تاريخ الالتحاق<input type="date" max={todayStr()} value={form.enrolledAt} onChange={set('enrolledAt')} /></label>
            <label>موضع الحفظ الحالي<input value={form.position} onChange={set('position')} /></label>
            <label>ملاحظات<input value={form.notes} onChange={set('notes')} /></label>
            <p className="small muted">لتسجيل الطالب في مستوى إضافي، افتح ملفه واضغط «مستوى».</p>
            <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}

      {editS && (
        <Modal title="تعديل بيانات الطالب" onClose={() => setEditS(null)}>
          <form onSubmit={saveStudent}>
            <label>الاسم<input value={editS.name} onChange={(e) => setEditS({ ...editS, name: e.target.value })} required /></label>
            <label>العمر<input type="number" min="3" max="100" value={editS.age} onChange={(e) => setEditS({ ...editS, age: e.target.value })} /></label>
            <label>الهاتف<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX أو 7XXXXXXXX أو +20…" value={editS.phone} onChange={(e) => setEditS({ ...editS, phone: e.target.value })} /><small className="small muted">سعودي: 05XXXXXXXX · يمني: 7XXXXXXXX · غيرهما: مع مفتاح الدولة مثل +20…</small></label>
            <label>تاريخ الالتحاق<input type="date" value={editS.enrolledAt} onChange={(e) => setEditS({ ...editS, enrolledAt: e.target.value })} /></label>
            <label>ملاحظات عامة<input value={editS.notes} onChange={(e) => setEditS({ ...editS, notes: e.target.value })} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}

      {editE && (
        <Modal title={`${editE.name} — ${editE.level || 'بلا مستوى'}`} onClose={() => setEditE(null)}>
          <form onSubmit={saveEnrollment}>
            <label>موضع الحفظ<input value={editE.position} onChange={(e) => setEditE({ ...editE, position: e.target.value })} /></label>
            <label>ملاحظات هذا المستوى<input value={editE.notes} onChange={(e) => setEditE({ ...editE, notes: e.target.value })} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}

      {grp && (
        <Modal title="إضافة إلى مجموعة" onClose={() => setGrp(null)}>
          {grp.list.length === 0 && <Empty text="لا توجد مجموعات. أنشئ مجموعة أولاً من صفحة المجموعات." />}
          <label>المجموعة<select value={grp.id} onChange={(e) => setGrp({ ...grp, id: e.target.value })}><option value="">اختر المجموعة</option>{grp.list.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <p className="small muted">سيُضاف الطلاب أصحاب التسجيلات المحددة. يبقون في مستوياتهم ومع معلميهم كما هم.</p>
          <button className="btn block" disabled={busy || !grp.id} onClick={addToGroup}>{busy ? 'جارٍ الإضافة…' : 'إضافة'}</button>
        </Modal>
      )}

      {move && (
        <Modal title="نقل التسجيلات إلى معلم" onClose={() => setMove(null)}>
          <label>المعلم الجديد<select value={move.to} onChange={(e) => setMove({ to: e.target.value })}><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {move.to && (
            <div className="card">
              <b>مراجعة قبل التأكيد</b>
              <p className="small muted">سيُنقل {selected.length} تسجيل إلى «{teacherName(move.to)}» (ينتقل المستوى المحدد فقط، وبقية مستويات الطالب تبقى عند معلميها):</p>
              {selected.map((e) => <div className="line" key={e.id}><span>{e.student.name}<small className="muted"> · {e.level?.name || 'بلا مستوى'}</small></span><small className="muted">من {e.teacher.name}</small></div>)}
              <p className="small muted">تبقى كل سجلاتهم السابقة كما هي، ويصل إشعار للمعلم الجديد.</p>
            </div>
          )}
          <button className="btn block" disabled={busy || !move.to} onClick={doMove}>{busy ? 'جارٍ النقل…' : 'تأكيد النقل'}</button>
        </Modal>
      )}
    </div>
  );
}
