import { api } from '../api.js';
import { Empty, ErrorBox, Loading, fmtDT, linkTo, qs, useLoad } from '../ui.jsx';

const Card = ({ n, label, to, warn }) => (
  <a className={'stat' + (warn && n > 0 ? ' warn' : '')} href={'#' + to}>
    <b>{n ?? '—'}</b>
    <span>{label}</span>
  </a>
);

export default function Home({ user }) {
  const { data, error, loading } = useLoad(() => api('/dashboard'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox text={error} />;
  const c = data.cards;

  return (
    <div>
      <div className="banner">
        <div className="bismillah sm">بسم الله الرحمن الرحيم</div>
        <h2>أهلاً {user.name}</h2>
        <p className="hadith">«خيرُكم من تعلَّم القرآنَ وعلَّمه» <small>(رواه البخاري)</small></p>
      </div>
      {data.role === 'manager' ? (
        <>
          <div className="grid">
            <Card n={c.students} label="إجمالي الطلاب" to="/students" />
            <Card n={c.teachersActive} label="معلمون نشطون" to={'/teachers' + qs({ status: 'active' })} />
            <Card n={c.teachersSuspended} label="معلمون موقوفون" to={'/teachers' + qs({ status: 'suspended' })} />
            <Card n={c.presentToday} label="حاضرون اليوم" to={'/students' + qs({ filter: 'present_today' })} />
            <Card n={c.absentToday} label="غائبون اليوم" to={'/students' + qs({ filter: 'absent_today' })} />
            <Card n={`${c.attendanceRate}%`} label="نسبة الحضور اليوم" to={'/students' + qs({ filter: 'present_today' })} />
            <Card n={c.avgHifz ?? '—'} label={`متوسط الحفظ (${data.avgPeriodDays} يوماً)`} to="/reports?type=school" />
            <Card n={c.avgReview ?? '—'} label={`متوسط المراجعة (${data.avgPeriodDays} يوماً)`} to="/reports?type=school" />
            <Card n={c.noEvalToday} label="بلا تقييم اليوم" to={'/students' + qs({ filter: 'no_eval_today' })} warn />
            <Card n={c.frequentAbsent} label="كثيرو الغياب" to={'/students' + qs({ filter: 'frequent_absent' })} warn />
            <Card n={c.pendingPromotions} label="طلبات ترقية معلقة" to="/promotions" warn />
          </div>
          <div className="card">
            <h3>الطلاب حسب المستوى</h3>
            {data.perLevel.length === 0 && <Empty text="لم تُنشأ مستويات بعد" />}
            {data.perLevel.map((l) => (
              <a key={l.id} className="line" href={'#/students' + qs({ levelId: l.id })}><span>{l.name}</span><b>{l.count}</b></a>
            ))}
          </div>
          <div className="card">
            <h3>آخر عمليات النقل</h3>
            {data.transfers.length === 0 && <Empty text="لا توجد عمليات نقل" />}
            {data.transfers.map((t, i) => (
              <a key={i} className="line" href={t.studentId ? `#/students/${t.studentId}` : '#/'}>
                <span>{t.student}<small className="muted"> · {t.from || '—'} ← {t.to}</small></span>
                <small className="muted">{fmtDT(t.at)}</small>
              </a>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid">
            <Card n={c.students} label="طلابي" to="/students" />
            <Card n={c.presentToday} label="حاضرون اليوم" to={'/students' + qs({ filter: 'present_today' })} />
            <Card n={c.absentToday} label="غائبون اليوم" to={'/students' + qs({ filter: 'absent_today' })} />
            <Card n={c.noEvalToday} label="بلا تقييم اليوم" to={'/students' + qs({ filter: 'no_eval_today' })} warn />
            <Card n={c.pendingPromotions} label="طلبات ترقية معلقة" to="/promotions" />
          </div>
          <div className="card">
            <h3>طلاب اليوم حسب المواعيد</h3>
            {data.today.length === 0 && <Empty text="لا يوجد طلاب موعدهم اليوم. حدّد أيام الحضور من جدول كل طالب." />}
            {data.today.map((s) => (
              <a key={s.id} className="line" href={`#/students/${s.studentId}`}>
                <span>{s.name}<small className="muted"> · {s.level || 'بلا مستوى'} · {s.arrivalTime || 'بلا وقت'}{s.startTime ? ` · تسميع ${s.startTime}` : ''}</small></span>
                {s.status && <span className={'tag ' + (s.status === 'present' ? 'ok' : 'bad')}>{s.status === 'present' ? 'حاضر' : 'غائب'}</span>}
              </a>
            ))}
          </div>
        </>
      )}
      <div className="card">
        <h3>أحدث الإشعارات</h3>
        {data.notifications.length === 0 && <Empty text="لا توجد إشعارات" />}
        {data.notifications.map((n) => (
          <a key={n.id} className={'line' + (n.read ? '' : ' unread')} href={linkTo(n.link)}>
            <span><b>{n.title}</b><br /><small className="muted">{n.body}</small></span>
          </a>
        ))}
      </div>
    </div>
  );
}
