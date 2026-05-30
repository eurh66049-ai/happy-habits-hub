import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Flame, Coins, Trophy, Sparkles, Gift, ShoppingBag } from 'lucide-react';
import { useGamificationState, useClaimDailyLogin, useCompleteDailyTask } from '@/hooks/useGamification';
import { levelProgress, type DailyTaskCode } from '@/services/gamification';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import DailyLuckWheel from '@/components/gamification/DailyLuckWheel';

const Rewards: React.FC = () => {
  const { user } = useAuth();
  const { data, isLoading } = useGamificationState();
  const claim = useClaimDailyLogin();
  const completeTask = useCompleteDailyTask();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-16 text-center min-h-screen" dir="rtl">
        <Helmet><title>مكافآتي — كتبي</title></Helmet>
        <h1 className="text-2xl font-bold mb-4">سجّل الدخول لرؤية مكافآتك</h1>
        <Link to="/auth"><Button>تسجيل الدخول</Button></Link>
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="flex justify-center pt-16 min-h-screen"><LoadingSpinner size="lg" /></div>;
  }

  const progress = levelProgress(data);
  const doneSet = new Set<DailyTaskCode>(data.daily_tasks_completed);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6" dir="rtl">
      <Helmet>
        <title>مكافآتي — كتبي</title>
        <meta name="description" content="نقاطك ومستواك وسلسلة قراءتك ومتجر النقاط في كتبي" />
      </Helmet>

      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <Sparkles className="text-amber-500" /> مكافآتي
      </h1>

      {/* بطاقة الحالة */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-amber-200/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Stat icon={<Trophy className="text-amber-500" />} label="XP" value={data.xp.toLocaleString('ar')} />
          <Stat icon={<Coins className="text-yellow-500" />} label="Kotobi Coins" value={data.coins.toLocaleString('ar')} />
          <Stat icon={<Flame className="text-orange-500" />} label="السلسلة الحالية" value={`${data.current_streak} يوم`} />
          <Stat icon={<Sparkles className="text-purple-500" />} label="أطول سلسلة" value={`${data.longest_streak} يوم`} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-lg">{data.level.name}</span>
            <span className="text-sm text-muted-foreground">
              {data.level.next_xp ? `${data.xp.toLocaleString('ar')} / ${data.level.next_xp.toLocaleString('ar')} XP` : 'أعلى مستوى!'}
            </span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {data.can_claim_daily && (
          <Button
            size="lg"
            className="w-full mt-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold"
            onClick={() => claim.mutate()}
            disabled={claim.isPending}
          >
            <Gift className="ml-2" />
            استلام مكافأة اليوم 🎁
          </Button>
        )}
        {!data.can_claim_daily && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            ✅ استلمت مكافأة اليوم. عُد غداً للحفاظ على سلسلتك!
          </p>
        )}
      </Card>

      {/* روابط سريعة */}
      {/* روابط سريعة */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link to="/shop">
          <Button variant="outline" className="w-full h-16 text-base"><ShoppingBag className="ml-2" /> متجر النقاط</Button>
        </Link>
        <Link to="/leaderboard">
          <Button variant="outline" className="w-full h-16 text-base"><Trophy className="ml-2" /> لوحة المتصدرين</Button>
        </Link>
      </div>

      {/* عجلة الحظ اليومية */}
      <DailyLuckWheel />

      {/* المهام اليومية */}
      <Card className="p-5 mb-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          🎯 المهام اليومية ({doneSet.size}/{data.daily_tasks.length})
        </h2>
        <p className="text-xs text-muted-foreground mb-3">أنجز 3 مهام واحصل على +50 XP إضافية!</p>
        <div className="space-y-2">
          {data.daily_tasks.map((t) => {
            const done = doneSet.has(t.code);
            return (
              <div
                key={t.code}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  done ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800' : 'bg-card'
                }`}
              >
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {done && '✅'} {t.title_ar}
                  </div>
                  {t.description_ar && (
                    <div className="text-xs text-muted-foreground mt-1">{t.description_ar}</div>
                  )}
                </div>
                <Badge variant="secondary">+{t.xp_reward} XP</Badge>
              </div>
            );
          })}
        </div>
      </Card>




      {/* الشارات */}
      <Card className="p-5 mb-6">
        <h2 className="text-xl font-bold mb-4">🏅 شاراتي ({data.badges.length})</h2>
        {data.badges.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد شارات بعد. واصل القراءة لكسبها!</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {data.badges.map((b) => (
              <div key={b.code} className="text-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition">
                <div className="text-3xl mb-1">{b.icon ?? '🏅'}</div>
                <div className="text-xs font-bold">{b.title_ar}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* جدول مكافآت السلسلة */}
      <Card className="p-5">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Flame className="text-orange-500" /> مكافآت السلسلة</h2>
        <div className="space-y-2 text-sm">
          <Row label="اليوم 1" value="10 XP + 5 🪙" />
          <Row label="اليوم 2" value="15 XP + 5 🪙" />
          <Row label="اليوم 3" value="20 XP + 5 🪙" />
          <Row label="اليوم 7" value="50 XP + 25 🪙 + شارة 🔥" highlight />
          <Row label="اليوم 30" value="300 XP + 100 🪙 + شارة 🌟" highlight />
          <Row label="اليوم 100" value="شارة الأسطورة 👑" highlight />
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">XP = نقاط الخبرة • 🪙 = عملات كتبي</p>
      </Card>
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="text-center">
    <div className="flex justify-center mb-1">{icon}</div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const Row: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className={`flex justify-between items-center p-2 rounded ${highlight ? 'bg-amber-100/50 dark:bg-amber-950/30 font-bold' : ''}`}>
    <span>{label}</span>
    <bdi dir="ltr" style={{ unicodeBidi: 'isolate' }}>{value}</bdi>
  </div>
);

const LEVEL_PERKS: Array<{ level: number; icon: string; title: string; description: string }> = [
  { level: 2, icon: '🎨', title: 'تخصيص لون الاسم', description: 'استخدم ألوان مميزة لاسمك في التعليقات والملف' },
  { level: 5, icon: '⭐', title: 'إطارات الصورة الرمزية', description: 'افتح إطارات حصرية لصورتك الشخصية' },
  { level: 8, icon: '💬', title: 'تمييز التعليقات', description: 'تعليقاتك ستظهر بخلفية مميزة في النقاشات' },
  { level: 12, icon: '📚', title: 'رفع كتب للمكتبة', description: 'ساهم بإضافة كتب جديدة لمجتمع كتبي' },
  { level: 15, icon: '🖼️', title: 'خلفيات الملف الشخصي', description: 'افتح خلفيات حصرية لتزيين ملفك' },
  { level: 20, icon: '🏆', title: 'شارة قارئ نخبة', description: 'شارة ذهبية بجانب اسمك في كل مكان' },
  { level: 30, icon: '👑', title: 'وصول مبكر للميزات الجديدة', description: 'جرّب الميزات قبل الجميع' },
];

export default Rewards;
