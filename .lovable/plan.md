# خطة نظام التحفيز (Gamification) لموقع كتبي

## نظرة عامة
بناء نظام كامل بثلاث طبقات منفصلة:
- **XP** (نقاط الخبرة): تُكتسب فقط ولا تُصرف، تحدد المستوى.
- **Kotobi Coins 🪙**: عملة تُكتسب وتُصرف في المتجر.
- **Streak**: عدّاد الأيام المتتالية.

---

## 1. قاعدة البيانات (الجداول الجديدة)

### `user_gamification`
سجل واحد لكل مستخدم. يحتوي: `xp`، `coins`، `level`، `current_streak`، `longest_streak`، `last_active_date`، `last_daily_claim_date`.

### `xp_ledger` و `coins_ledger`
سجل كل معاملة (للشفافية ومنع التكرار). يحتوي: `user_id`، `amount`، `reason` (enum: `daily_login`, `read_book`, `finish_book`, `review`, `like`, `daily_tasks_bonus`, `streak_milestone`, `shop_purchase`...)، `reference_id` (مثلاً `book_id` لمنع تكرار المكافأة لنفس الكتاب)، `created_at`.

### `book_completions`
لمنع منح مكافأة "إنهاء الكتاب" مرتين. يحتوي: `user_id`، `book_id`، `completed_at`، `method` (auto_95pct / manual / time_based). قيد فريد على `(user_id, book_id)`.

### `daily_tasks` و `user_daily_task_progress`
المهام اليومية الـ4: قراءة كتاب جديد، إضافة مراجعة، إضافة لقائمة القراءة، مشاركة اقتباس. إعادة تعيين يومية. مكافأة +50 XP عند إكمال 3 منها.

### `shop_items` و `user_shop_purchases`
عناصر المتجر: لون اسم، إطار صورة، شارات، تمييز التعليقات. لكل عنصر `price_coins`. سجل الشراء يربط بالمستخدم.

### `user_badges`
الشارات المكتسبة (7 أيام، 30 يوماً، 100 يوم، إنهاء أول كتاب...).

### `leaderboards` (عرض/Materialized View)
أفضل قراء الأسبوع / الشهر بناءً على `xp_ledger`.

### RLS
- كل مستخدم يرى/يعدّل بياناته فقط (`auth.uid() = user_id`).
- المتجر والشارات والمهام قابلة للقراءة العامة.
- منح النقاط/العملة يمر عبر **server functions** فقط (لا INSERT مباشر من العميل).

---

## 2. منطق منح المكافآت (Server Functions في TanStack)

كل منح يتم في `createServerFn` مع `requireSupabaseAuth` لمنع التزوير:

| Server Function | الغرض |
|---|---|
| `claimDailyLogin` | يتحقق من التاريخ، يمنح 10/15/20/.../50 XP بحسب يوم السلسلة، يحدّث streak |
| `awardBookProgress` | يُستدعى من القارئ عند تجاوز 95% أو بعد وقت كافٍ للكتب القصيرة، يُدخل في `book_completions` (idempotent) ويمنح 100 XP + 20 Coins |
| `awardReadingActivity` | +20 XP عند فتح/قراءة كتاب (مرة واحدة يومياً لكل كتاب) |
| `awardReview` | تُستدعى بعد INSERT في `book_reviews`، تمنح +30 XP |
| `awardLike` / `awardBookmark` | +5 XP (محدود بحد يومي لمنع التلاعب) |
| `completeDailyTask` | يحدّث التقدم، وعند 3/4 مهام يمنح +50 XP |
| `purchaseShopItem` | يخصم Coins بشكل ذرّي (transaction) ويسجل الشراء |
| `getUserGamificationState` | يعيد كل بيانات المستخدم للواجهة |
| `getLeaderboard` | أسبوعي/شهري |

**قاعدة 95%**: نضيف عمود `progress_percentage` (إن لم يوجد في `reading_progress`)، وعند ≥95% يُستدعى `awardBookProgress` تلقائياً مرة واحدة فقط.

**الكتب القصيرة (<20 صفحة)**: يُشترط `min_reading_seconds` (نحسبه من `reading_sessions_tracking`) قبل منح المكافأة.

---

## 3. واجهة المستخدم (Frontend)

### مسارات/مكونات جديدة:
- `/rewards` — لوحة شاملة: XP، Coins، المستوى، شريط التقدم، Streak، الشارات، المهام اليومية، زر "المطالبة بمكافأة اليوم".
- `/shop` — متجر النقاط مع التصنيفات (ألوان، إطارات، شارات، تمييزات).
- `/leaderboard` — لوحة المتصدرين (أسبوع/شهر/أكثر إنهاءً).
- **مكوّن في الـHeader**: شارة صغيرة تعرض Coins + Level + إشعار "مكافأة اليوم متاحة 🎁".
- **مودال يومي تلقائي** عند أول تسجيل دخول في اليوم: يعرض المكافأة ويطلب المطالبة بضغطة.
- **تكامل في صفحة الكتاب**: إظهار "+100 XP عند الإنهاء" والاحتفال (confetti) عند الوصول 95%.
- **تكامل في الملف الشخصي**: عرض المستوى، الشارات، الإطار المختار، لون الاسم المختار.

### المستويات
1. قارئ مبتدئ (0–500)
2. قارئ نشيط (500–2000)
3. قارئ محترف (2000–5000)
4. أسطورة القراءة (5000+)

---

## 4. التنفيذ على مراحل (داخل نفس الجولة)

1. **الهجرة (Migration)**: كل الجداول + RLS + GRANTs + Triggers + Functions في `public`.
2. **Server Functions**: ملف `src/lib/gamification.functions.ts` + helpers في `gamification.server.ts`.
3. **مكونات UI**: `RewardsPage`, `ShopPage`, `LeaderboardPage`, `DailyLoginModal`, `HeaderRewardsBadge`, `LevelBadge`, `StreakFlame`.
4. **التكامل**: استدعاءات في القارئ، صفحة الكتاب، بعد كتابة مراجعة، إلخ.
5. **الترجمة**: كل النصوص بالعربية (يمكن إضافة الإنجليزية لاحقاً).

---

## 5. تفاصيل تقنية مهمة

- **منع التلاعب**: كل المنح خادمية، مع قيود فريدة وحدود يومية.
- **الذرّية**: استخدام `pl/pgsql` functions مع SECURITY DEFINER للعمليات المركّبة (خصم Coins + إدراج شراء).
- **الأداء**: فهارس على `xp_ledger(user_id, created_at)` و`coins_ledger(user_id, created_at)`.
- **التوافق مع الموجود**: نستفيد من `challenge_activities`, `reading_sessions_tracking`, `user_activities` كمصادر بدلاً من تكرار البيانات.
- **اختياري لاحقاً**: cron يومي لإغلاق Streaks المنقطعة وإعادة تعيين المهام اليومية.

---

## ملاحظة
هذا عمل ضخم — الهجرة وحدها ستضم 10+ جداول و30+ سياسة RLS، وأكثر من 10 server functions، و4-5 صفحات/مكونات كبيرة. سأنفذه دفعة واحدة كما طلبت، لكن قد يستغرق عدة جولات متتالية لاكتمال كل التكاملات (خصوصاً ربط القارئ وصفحات الكتب الموجودة).

هل أبدأ بالهجرة الآن؟