# نظام إدارة مدرسة تحفيظ القرآن — المرحلة 2 (الأساس)

يشمل: الدخول والجلسات الآمنة، الأدوار (مدير/مشرف/معلم) مع فرض الصلاحيات في الخادم،
إدارة حسابات المعلمين والمشرفين، سجل العمليات، فحص الصحة، واجهة عربية RTL للجوال.

## التشغيل محلياً
1. `cp .env.example .env` ثم عبّئ MONGODB_URI وSESSION_SECRET وبيانات المدير الأول.
2. `npm install && npm run build`
3. `npm start` ثم افتح http://localhost:3000
(للتطوير: `npm run dev` للخادم، و`cd client && npm install && npm run dev` للواجهة.)

## النشر على Render
1. ارفع المشروع إلى GitHub (ملف `.env` مستثنى تلقائياً).
2. في Render: New → Blueprint (يقرأ `render.yaml`) أو Web Service يدوياً:
   Build: `npm install && npm run build` — Start: `npm start` — Health Check: `/api/health`.
3. أضف متغيرات البيئة من `.env.example` (القيم السرية تُكتب في Render فقط).
4. بعد أول تشغيل ناجح وإنشاء المدير، احذف `INITIAL_ADMIN_PASSWORD` من Render.

## MongoDB Atlas
أنشئ Cluster مجاني، ومستخدم قاعدة بيانات، وفي Network Access أضف `0.0.0.0/0` (Render لا يملك IP ثابتاً في الخطة المجانية)،
ثم انسخ رابط الاتصال إلى `MONGODB_URI`.
