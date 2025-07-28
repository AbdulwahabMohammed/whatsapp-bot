# بوت واتساب الذكي

## مقدمة
هذا المشروع يوفر هيكلًا لبناء بوت خدمة عملاء على واتساب معتمد على OpenAI Assistants API. يهدف البوت إلى إدارة المحادثات والرد على استفسارات العملاء اعتمادًا على الملفات المرجعية الخاصة بكل منشأة.

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
1. نسخ الملف `.env.example` إلى `.env` وتعبئة مفاتيح OpenAI وبيانات PostgreSQL.
2. تثبيت الاعتمادات:
   ```bash
   npm install
   ```
3. تهيئة الجداول في قاعدة البيانات:
   ```bash
   node src/initDb.js
   ```
4. تشغيل المثال الأساسي:
   ```bash
   npm start
   ```
5. إنشاء مساعد OpenAI لمنشأة معينة:
   ```bash
   node src/scripts/createAssistant.js <organizationId>
   ```
6. رفع ملف مرجعي وربطه بالمساعد:
   ```bash
   node src/scripts/uploadFile.js <organizationId> <path/to/file>
   ```
7. تشغيل بوت واتساب (يتطلب متغير `ORGANIZATION_ID` في `.env`):
   ```bash
   npm run whatsapp
   ```
   في أول تشغيل ستظهر صورة QR في الطرفية لربط حساب واتساب.

## بنية المجلد `src/`
- `db.js` – إعداد اتصال PostgreSQL.
- `openai.js` – تهيئة عميل OpenAI ليعمل مع الإصدارات المختلفة.
- `initDb.js` – إنشاء الجداول الرئيسية في قاعدة البيانات.
- `assistant.js` – إنشاء المساعد وإدارة ملفات المرجع.
- `chat.js` – إرسال الرسائل ومتابعة المحادثات داخل الخيوط.
- `whatsappBot.js` – ربط البوت بتطبيق واتساب وتوجيه الرسائل.
- `index.js` – مثال مبسط لإضافة المنشآت وعرضها.
- المجلد `scripts/` يضم أوامر CLI مثل `createAssistant.js` و`uploadFile.js`.

## التوثيق
يوفر المجلد `docs/` شروحات تفصيلية حول إعداد المشروع واستخدامه، ومنها:
- [docs/setup.md](docs/setup.md) – خطوات الإعداد المحلي.
- [docs/openai.md](docs/openai.md) – كيفية تهيئة عميل OpenAI وملاحظات الإصدارات.
