export default function Home({ user }) {
  return (
    <div className="card">
      <h2>أهلاً {user.name}</h2>
      <p className="muted">
        تم تجهيز الأساس: الدخول والصلاحيات وإدارة الحسابات. الطلاب والتسجيل اليومي والتقارير ستُضاف في المراحل التالية.
      </p>
    </div>
  );
}
