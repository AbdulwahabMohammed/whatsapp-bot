# بوت واتساب الذكي

### حالة CI
يتم تشغيل الاختبارات تلقائيًا عبر GitHub Actions على كل `push` أو `pull_request`.
[![Node.js CI](https://github.com/AbdulwahabMohammed/whatsapp-bot/actions/workflows/node-test.yml/badge.svg)](https://github.com/AbdulwahabMohammed/whatsapp-bot/actions/workflows/node-test.yml)

## مقدمة
هذا المشروع يوفر هيكلًا لبناء بوت خدمة عملاء على واتساب، معتمد على OpenAI Assistants API.
يهدف البوت إلى إدارة المحادثات والرد على استفسارات العملاء اعتمادًا على الملفات المرجعية الخاصة بكل منشأة.
يتطلب تشغيل المشروع وجود Node.js بإصدار 18 أو أحدث.
يدعم البوت أيضًا استقبال الصور والمستندات وحفظها في مجلد `uploads/` لعرضها لاحقًا من لوحة الإدارة.
## المتطلبات
- Node.js 18 أو أحدث
- قاعدة بيانات PostgreSQL
- الحزم التالية الموجودة في `package.json`:
  - openai@^5.9.0
  - pg
  - dotenv
  - @whiskeysockets/baileys
  - @hapi/boom
  - qrcode-terminal

## خطوات التثبيت والتشغيل
1. نسخ الملف `.env.example` إلى `.env` وتعبئة مفاتيح OpenAI وبيانات PostgreSQL،
   مع تحديد متغيرات `ADMIN_PASSWORD` و`ADMIN_PORT` و`SESSION_SECRET` للوحة الإدارة.
   يجب أن تكون قيمة `SESSION_SECRET` فريدة وغير "secret" حتى يعمل الخادم في بيئة الإنتاج.
   يمكن كذلك تعديل `SUMMARY_MESSAGE_LIMIT` لتحديد عدد الرسائل قبل تلخيص المحادثة،
   وضبط `BULK_MESSAGE_DELAY` لتعيين الفاصل الزمني بين الرسائل الجماعية،
   وضبط `LOG_LEVEL` لتغيير مستوى السجلات.
   **ملاحظة:** تأكد من أن المتغير `OPENAI_API_KEY` يحتوي على مفتاح صحيح من
   [منصة OpenAI](https://platform.openai.com/account/api-keys) قبل تشغيل أي أوامر
   إدارية مثل `npm run admin`، وتجنب استخدام القيم التجريبية أو `your-openai-key`.
2. تثبيت الاعتمادات:
   ```bash
   npm install
   ```
3. تهيئة الجداول في قاعدة البيانات:
  ```bash
  node src/initDb.js
  ```
ينشئ هذا الأمر جداول `organizations` و`documents` و`conversations` بالإضافة
إلى جدول **messages** الذي يحفظ نصوص كل الرسائل المتبادلة.
كما يتم إنشاء مستخدم افتراضي باسم `admin` وكلمة المرور من المتغير `ADMIN_PASSWORD` مع دور `admin` لإدارة النظام.
4. تشغيل المثال الأساسي:
   ```bash
   npm start
   ```
5. إنشاء مساعد OpenAI لمنشأة معينة:
   ```bash
   node src/scripts/createAssistant.js <organizationId>
   ```
   يمكن تحديد نص التعليمات الخاص بالمنشأة عبر لوحة الإدارة أو مباشرة في الجدول، وسيتم استخدامه عند إنشاء المساعد أو تحديثه.
6. رفع ملف مرجعي وربطه بالمساعد:
   ```bash
   node src/scripts/uploadFile.js <organizationId> <path/to/file>
   ```
7. تشغيل بوت واتساب (يُحمِّل جميع المنشآت تلقائيًّا):
   ```bash
   npm run whatsapp
   ```
   في أول تشغيل ستظهر صورة QR في الطرفية لربط حساب واتساب.
يعمل البوت على كافة المنشآت المسجلة في قاعدة البيانات والتي تحتوي على معرف مساعد.

8. تشغيل واجهة الإدارة:
   ```bash
   npm run admin
   ```
   يشغِّل هذا الأمر الخادم عبر الدالة `startAdminServer()` في `src/admin.js`.
   تتطلب الواجهة تعيين المتغيرين `ADMIN_PASSWORD` و`ADMIN_PORT` في ملف البيئة.
بعد تشغيل الخادم سجِّل الدخول بحساب `admin` ثم يمكنك تفعيل المصادقة الثنائية من صفحة "Profile" إن أردت.
من الصفحة نفسها يمكن تعطيل 2FA لاحقًا.
بعد ذلك يمكن إدارة المستخدمين عبر صفحة `/users` وتعديل أدوارهم بين `admin` و`editor`.
يمكن كذلك البحث في سجل الرسائل من خلال صفحة `/messages` مع إمكانية تصدير النتائج بصيغة CSV أو PDF.
توفر الواجهة أيضًا صفحة `/analytics` التي تعرض متوسط زمن الاستجابة بين استلام الرسالة وإرسال الرد يوميًا، إضافة إلى صفحة `/stats` لمراقبة حالة الاتصال وعدد الرسائل.
من قائمة المنشآت يمكن اختيار "Edit Hours" لضبط قيم `working_hours_start` و`working_hours_end` الخاصة بكل منشأة، ويجيب البوت تلقائيًّا بالرسالة الموجودة في `instructions` خارج هذه الساعات.

9. تشغيل عامل المعالجة:
   ```bash
   npm run worker
   ```
   **ملاحظة:** يجب عدم تشغيل `npm run whatsapp` و`npm run worker` في الوقت نفسه
   للحساب ذاته، لأن مكتبة Baileys ستقطع الاتصال برسالة "Stream Errored
   (conflict)" عند اكتشاف تعارض.

10. توليد اقتراحات الأسئلة المتكررة:
   ```bash
   npm run generate-faq
   ```

## بنية المجلد `src/`
- `db.js` – إعداد اتصال PostgreSQL.
- `openai.js` – تهيئة عميل OpenAI ليعمل مع الإصدارات المختلفة.
- `initDb.js` – إنشاء الجداول الرئيسية في قاعدة البيانات بما فيها جدول الرسائل.
- `assistant.js` – إنشاء المساعد وإدارة ملفات المرجع.
- `chat.js` – إرسال الرسائل ومتابعة المحادثات داخل الخيوط.
- `whatsappBot.js` – ربط البوت بتطبيق واتساب وتوجيه الرسائل.
- `index.js` – مثال مبسط لإضافة المنشآت وعرضها.
- المجلد `scripts/` يضم أوامر CLI مثل `createAssistant.js` و`uploadFile.js`.
- `logger.js` – تهيئة Winston لتسجيل الرسائل في ملفات `logs/`.
- `metrics.js` – تعريف مقاييس Prometheus مثل عدد الطلبات وحالة الاتصال.
- `queue.js` – إنشاء طوابير BullMQ لرسائل واتساب والرسائل الجماعية.
- `scheduler.js` – تنفيذ المهام المجدولة وإرسال الرسائل في وقتها.
- `worker.js` – معالجة الرسائل من الطابور وإرسالها عبر واتساب.

## التوثيق
يوفر المجلد `docs/` شروحات تفصيلية حول إعداد المشروع واستخدامه، ومنها:
- [docs/setup.md](docs/setup.md) – خطوات الإعداد المحلي.
- [docs/openai.md](docs/openai.md) – كيفية تهيئة عميل OpenAI وملاحظات الإصدارات.
يوجد ملف [docs/review_notes.md](docs/review_notes.md) قد يتضمّن ملاحظات من المراجعين.
يجب على كل مساهم تفقد هذا الملف عند بدء أي مهمة أو مراجعة،
ثم حذف محتواه بالكامل بعد تنفيذ جميع الملاحظات.

## استخدام Docker
يوفر المشروع ملفات `Dockerfile` و`docker-compose.yml` لتشغيل البوت داخل حاويات.

1. انسخ `.env.example` إلى `.env` وعدل قيم متغيرات البيئة مثل مفاتيح OpenAI وإعدادات PostgreSQL،
   ولا تنس تعيين `SESSION_SECRET` بقيمة عشوائية غير "secret". يمكن تعديل `SUMMARY_MESSAGE_LIMIT` إذا أردت تغيير
   عدد الرسائل قبل تلخيص المحادثة.
2. أنشئ الجداول داخل قاعدة البيانات (يُنفذ مرة واحدة):
   ```bash
   docker compose run --rm bot node src/initDb.js
   ```
3. شغل الخدمات:
   ```bash
   docker compose up --build
   ```
سيُشغِّل هذا الأمر البوت والعامل والRedis في حاويات منفصلة.

يعتمد `docker-compose.yml` على المتغيرات في ملف `.env` ويضبط متغير `PGHOST` تلقائيًا على `db`. تعمل قاعدة البيانات على المنفذ `5432` بينما تُعرض لوحة الإدارة على المنفذ المحدد في `ADMIN_PORT`.

## الرخصة
هذا المشروع موزع وفق رخصة MIT، ويمكنك الاطلاع على نص الرخصة في ملف [LICENSE](LICENSE).
جميع حقوق النشر محفوظة لـ whatsapp-bot 2024.
