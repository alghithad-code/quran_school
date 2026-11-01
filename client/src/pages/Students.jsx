import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, FILTER_AR, Icon, IconBtn, Loading, Modal, Progress, STATUS_AR, fmtTime, go, initial, qs, todayStr, useFlash } from '../ui.jsx';

const blank = { name: '', age: '', phone: '', enrolledAt: todayStr(), teacherId: '', levelId: '', position: '', notes: '' };

// embedded: تُستخدم داخل صفحة المعلم (الفلاتر محلية ولا تغيّر العنوان)
export default function Students({ me, online, query, embedded = false, onFilter }) {
  const isManager = me.role !== 'teacher';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: null, total: 0, pages: 1 });
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [form, setForm] = useState(null);
  const [edit, setEdit] = useState(null);
  const [move, setMove] = useState(null);
  const [grp, setGrp] = useState(null); // إضافة المحدد إلى مجموعة
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const key = JSON.stringify(query);

  useEffect(() => {
    if (isManager) api('/users?role=teacher&status=active&limit=50').then((d) => setTeachers(d.items)).catch(() => {});
    api('/levels').then((d) => setLevels(d.items)).catch(() => {});
  }, [isManager]);

  const load = useCallback(async (p = 1, append = false) => {
    try {
      const d = await api('/students' + qs({ ...query, q, page: p, limit: 30 }));
      setData((cur) => ({ ...d, items: append ? [...(cur.items || []), ...d.items] : d.items }));
      setPage(p);
    } catch (e) { flash.err(e); setData((c) => ({ ...c, items: c.items || [] })); }
  }, [key, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(new Set()); const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);

  const setFilter = (k, v) => (onFilter ? onFilter(k, v) : go('/students' + qs({ ...query, [k]: v })));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const items = data.items;

  async function mark(s, status) {
    try {
      await api(`/students/${s.id}/attendance`, { method: 'POST', body: { status } });
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, today: status } : x)) })); // بعد تأكيد الخادم
    } catch (e) { flash.err(e); }
  }
  // تحضير المحدد دفعة واحدة
  async function bulk(status) {
    setBusy(true); flash.clear();
    try {
      const r = await api('/attendance/bulk', { method: 'POST', body: { studentIds: [...sel], status } });
      const done = new Set(r.done);
      setData((d) => ({ ...d, items: d.items.map((x) => (done.has(x.id) ? { ...x, today: status } : x)) }));
      let msg = `تم تسجيل ${status === 'present' ? 'حضور' : 'غياب'} ${r.done.length} طالب`;
      if (r.skipped.length) msg += ` — تعذّر ${r.skipped.length} (سجلهم لمعلم آخر): ${r.skipped.slice(0, 3).join('، ')}`;
      flash.ok(msg);
      setSel(new Set());
    } catch (e) { flash.err(e); } finally { setBusy(false); }
  }
  async function create(e) {
    e.preventDefault(); setBusy(true);
    try { await api('/students', { method: 'POST', body: form }); flash.ok('تمت إضافة الطالب'); setForm(null); load(1); } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function saveEdit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const { id, name, age, phone, enrolledAt, position, notes } = edit;
      await api('/students/' + id, { method: 'PATCH', body: isManager ? { name, age, phone, enrolledAt, position, notes } : { position, notes } });
      flash.ok('تم حفظ التعديل'); setEdit(null); load(1);
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function doMove() {
    setBusy(true);
    try {
      const r = await api('/transfers', { method: 'POST', body: { studentIds: [...sel], toTeacherId: move.to } });
      flash.ok(`تم نقل ${r.moved} طالب` + (r.skipped ? ` (تجاوز ${r.skipped} مرتبطاً بالمعلم نفسه)` : ''));
      setMove(null); setSel(new Set()); load(1);
    } catch (er) { flash.err(er); } finally { setBusy(false); }
  }
  async function openGroups() {
    try { setGrp({ list: (await api('/groups')).items, id: '' }); } catch (e) { flash.err(e); }
  }
  async function addToGroup() {
    setBusy(true);
    try {
      const r = await api(`/groups/${grp.id}/members`, { method: 'POST', body: { add: [...sel] } });
      flash.ok(`تمت إضافة ${sel.size} طالب. عدد طلاب المجموعة الآن ${r.studentCount}`);
      setGrp(null); setSel(new Set());
    } catch (e) { flash.err(e); } finally { setBusy(false); }
  }
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selected = (items || []).filter((s) => sel.has(s.id));
  const active = (items || []).filter((s) => s.status === 'active');
  const allOn = active.length > 0 && active.every((s) => sel.has(s.id));
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name;

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="بحث بالاسم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
        {isManager && <IconBtn icon="plus" label="إضافة طالب" caption="طالب" tone="on" disabled={!online} onClick={() => setForm({ ...blank, teacherId: embedded ? query.teacherId : '' })} />}
      </div>

      <div className="chips">
        {query.filter && <button className="chip on" onClick={() => setFilter('filter', '')}>{FILTER_AR[query.filter]} ✕</button>}
        <button className={'chip' + (query.today === '1' ? ' on' : '')} onClick={() => setFilter('today', query.today === '1' ? '' : '1')}>موعدهم اليوم</button>
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

      {active.length > 0 && (
        <div className={sel.size ? 'bulkbar' : 'row'}>
          <div className="irow">
            <IconBtn icon="check" tone="sel" on={allOn} label="تحديد الكل" caption={allOn ? 'إلغاء الكل' : 'تحديد الكل'} onClick={() => setSel(allOn ? new Set() : new Set(active.map((s) => s.id)))} />
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
          <div className="metas">
            <span className="m"><Icon name="layers" size={14} />{s.level?.name || 'بلا مستوى'}</span>
            {isManager && !embedded && <span className="m"><Icon name="user" size={14} />{s.teacher.name || '—'}</span>}
            {s.schedule?.arrivalTime && <span className="m"><Icon name="moon" size={14} />يحضر {fmtTime(s.schedule.arrivalTime)}</span>}
          </div>
          {s.progress && <Progress thin pct={s.progress.pct} label={`تقدّم ${s.level?.name}: ${s.progress.pct}% (${s.progress.memorized} من ${s.progress.total} آية)`} />}
          <div className="irow">
            {s.status === 'active' && <IconBtn icon="check" tone="sel" on={sel.has(s.id)} label="تحديد" onClick={() => toggleSel(s.id)} />}
            {s.status === 'active' && <IconBtn icon="check" tone={s.today === 'present' ? 'on' : 'ok'} on={s.today === 'present'} caption="حاضر" label="تسجيل حضور" disabled={!online} onClick={() => mark(s, 'present')} />}
            {s.status === 'active' && <IconBtn icon="x" tone={s.today === 'absent' ? 'bad on' : 'danger'} on={s.today === 'absent'} caption="غائب" label="تسجيل غياب" disabled={!online} onClick={() => mark(s, 'absent')} />}
            <IconBtn icon="file" label="ملف الطالب" href={'#/students/' + s.id} />
            {s.whatsapp && <IconBtn icon="chat" tone="wa" label="واتساب" href={s.whatsapp} />}
            <IconBtn icon="edit" label="تعديل" disabled={!online} onClick={() => setEdit({ id: s.id, name: s.name, age: s.age ?? '', phone: s.phone, enrolledAt: s.enrolledAt, position: s.position, notes: s.notes })} />
          </div>
        </div>
      ))}
      {page < data.pages && <button className="btn ghost block" onClick={() => load(page + 1, true)}>عرض المزيد ({data.total - (items?.length || 0)} متبقٍ)</button>}

      {form && (
        <Modal title="طالب جديد" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            <label>الاسم<input value={form.name} onChange={set('name')} required /></label>
            <label>المعلم<select value={form.teacherId} onChange={set('teacherId')} required><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>المستوى<select value={form.levelId} onChange={set('levelId')}><option value="">بلا مستوى</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>العمر<input type="number" inputMode="numeric" min="3" max="100" value={form.age} onChange={set('age')} /></label>
            <label>رقم الهاتف (اختياري)<input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={set('phone')} /></label>
            <label>تاريخ الالتحاق<input type="date" max={todayStr()} value={form.enrolledAt} onChange={set('enrolledAt')} /></label>
            <label>موضع الحفظ الحالي<input value={form.position} onChange={set('position')} /></label>
            <label>ملاحظات<input value={form.notes} onChange={set('notes')} /></label>
            <button className="btn block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title="تعديل الطالب" onClose={() => setEdit(null)}>
          <form onSubmit={saveEdit}>
            {isManager && (<>
              <label>الاسم<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></label>
              <label>العمر<input type="number" min="3" max="100" value={edit.age} onChange={(e) => setEdit({ ...edit, age: e.target.value })} /></label>
              <label>الهاتف<input dir="ltr" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
              <label>تاريخ الالتحاق<input type="date" value={edit.enrolledAt} onChange={(e) => setEdit({ ...edit, enrolledAt: e.target.value })} /></label>
            </>)}
            <label>موضع الحفظ<input value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} /></label>
            <label>ملاحظات<input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            <button className="btn block" disabled={busy}>حفظ</button>
          </form>
        </Modal>
      )}

      {grp && (
        <Modal title="إضافة إلى مجموعة" onClose={() => setGrp(null)}>
          {grp.list.length === 0 && <Empty text="لا توجد مجموعات. أنشئ مجموعة أولاً من صفحة المجموعات." />}
          <label>المجموعة<select value={grp.id} onChange={(e) => setGrp({ ...grp, id: e.target.value })}><option value="">اختر المجموعة</option>{grp.list.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <p className="small muted">سيُضاف {sel.size} طالب. يبقون في مستوياتهم ومع معلميهم كما هم.</p>
          <button className="btn block" disabled={busy || !grp.id} onClick={addToGroup}>{busy ? 'جارٍ الإضافة…' : 'إضافة'}</button>
        </Modal>
      )}

      {move && (
        <Modal title="نقل الطلاب" onClose={() => setMove(null)}>
          <label>المعلم الجديد<select value={move.to} onChange={(e) => setMove({ to: e.target.value })}><option value="">اختر المعلم</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {move.to && (
            <div className="card">
              <b>مراجعة قبل التأكيد</b>
              <p className="small muted">سيُنقل {selected.length} طالب إلى «{teacherName(move.to)}»:</p>
              {selected.map((s) => <div className="line" key={s.id}><span>{s.name}</span><small className="muted">من {s.teacher.name}</small></div>)}
              <p className="small muted">تبقى كل سجلاتهم السابقة كما هي، ويصل إشعار للمعلم الجديد.</p>
            </div>
          )}
          <button className="btn block" disabled={busy || !move.to} onClick={doMove}>{busy ? 'جارٍ النقل…' : 'تأكيد النقل'}</button>
        </Modal>
      )}
    </div>
  );
}
