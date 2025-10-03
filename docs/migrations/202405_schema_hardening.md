# خطة ترحيل مكملة: تعزيز المخطط الأساسي

تضيف هذه الخطة أعمدة تتبع وقيود سلامة لدعم وحدات الأعمال الخاصة بالتصعيد،
الإحصاءات، وإدارة الوثائق.

## المتطلبات قبل التنفيذ

1. التأكد من أخذ نسخة احتياطية من قاعدة البيانات (pg_dump) لقاعدة بيانات الإنتاج.
2. التحقق من أن جميع المهام في BullMQ فارغة لتجنب إنشاء سجلات جديدة أثناء الترقية.
3. التواصل مع فرق وحدات الأعمال لإبلاغهم بفترة الصيانة المتوقعة (10 دقائق تقريبًا).

## خطوات التنفيذ

1. نشر الكود الذي يحتوي على الترحيل `000002_schema_hardening.js`.
2. تشغيل أوامر الترحيل:
   ```bash
   npm run migrate up
   ```
3. تنفيذ سكربت فحص سريع للتأكد من صحة الفهارس:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename IN (
     'organizations','documents','conversations','messages','scheduled_messages',
     'usage_stats','conversation_stats','unanswered_questions','faq_suggestions'
   );
   ```
4. تحديث سكربتات استيراد الوثائق لحساب `checksum` وتمرير `source_url` قبل إدراج
   السجلات الجديدة.
5. تحديث مهام التصعيد في لوحة التحكم للتعامل مع الحقول `escalated_at` و`escalated_by`.
6. نشر التعديلات على الخوادم العاملة بعد التأكد من نجاح الخطوات السابقة.

## تهيئة البيانات بعد الترحيل

- ملء الأعمدة الزمنية الجديدة للبيانات القديمة:
  ```sql
  UPDATE organizations SET updated_at = created_at WHERE updated_at IS NULL;
  UPDATE documents SET updated_at = created_at WHERE updated_at IS NULL;
  UPDATE conversations SET updated_at = created_at WHERE updated_at IS NULL;
  UPDATE scheduled_messages SET updated_at = created_at WHERE updated_at IS NULL;
  UPDATE users SET created_at = NOW(), updated_at = NOW() WHERE created_at IS NULL;
  ```
- ربط الأسئلة غير المجابة والاقتراحات بالمنشآت بناءً على السجلات الحالية في لوحة
  التحكم لضمان سلامة القيود الجديدة.

## خطة التراجع (Rollback)

إذا ظهرت مشكلة بعد الترقية:

1. إيقاف العمال وخدمات الويب لتجميد الكتابة.
2. تشغيل:
   ```bash
   npm run migrate down 000002
   ```
   سيزيل ذلك كل الأعمدة والفهارس الجديدة ويعيد القيود السابقة.
3. استعادة نسخة قاعدة البيانات إذا لزم الأمر باستخدام:
   ```bash
   pg_restore -d <database> backup.sql
   ```
4. إعادة تشغيل الخدمات بعد التأكد من سلامة البيانات.

## مراقبة ما بعد التنفيذ

- متابعة لوحات الاستخدام للتأكد من أن سجلات `usage_stats` يتم تعبئتها بالنطاقات
  الزمنية الصحيحة.
- التحقق من رسائل الخطأ في سجل المجدول لضمان نجاح الحقول `status` و`error`.
- مراقبة التزامن بين المستندات ومخزن المتجهات عبر مقارنة `checksum` و`updated_at`.
