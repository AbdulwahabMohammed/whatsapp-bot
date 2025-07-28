# استخدام عميل OpenAI

يعتمد البوت على مكتبة `openai` للتواصل مع واجهة OpenAI وإدارة المساعدات. تم تحديد الإصدار `^5.9.0` في ملف `package.json`، لكن الكود مهيأ للعمل مع عدة إصدارات من المكتبة.

بعض الإصدارات تصدّر الفئة `OpenAI` كقيمة افتراضية بينما إصدارات أخرى تقدّمها كمُصدّر باسم `OpenAI`. وللتوافق بين الإصدارات يستخدم الملف `src/openai.js` الشيفرة التالية:

```javascript
let OpenAI;
try {
  // يفضّل التصدير الافتراضي في الإصدارات الحديثة
  OpenAI = require('openai').default;
  if (!OpenAI) {
    ({ OpenAI } = require('openai'));
  }
} catch (err) {
  ({ OpenAI } = require('openai'));
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

بهذه الطريقة يمكن تحديث مكتبة `openai` دون الحاجة لتعديل بقية أجزاء المشروع، مع بقاء الاعتماد على متغير `OPENAI_API_KEY` في ملف `.env` للوصول إلى واجهة OpenAI.
