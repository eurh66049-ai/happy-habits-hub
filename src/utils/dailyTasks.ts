// مساعد موحّد لإكمال المهام اليومية بصمت من أماكن الأحداث في التطبيق.
// يستدعي RPC في Supabase (آمن وقابل لإعادة الاستدعاء — الخادم يتعامل مع التكرار)
// ويُظهر إشعار نجاح فقط عند إكمال المهمة لأول مرة في اليوم.
import { toast } from 'sonner';
import { gamification, type DailyTaskCode } from '@/services/gamification';

const inFlight = new Set<string>();

export async function markDailyTask(code: DailyTaskCode) {
  // منع نداءات متكررة في نفس الجلسة لنفس المهمة
  const key = `${code}:${new Date().toDateString()}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  try {
    const res = await gamification.completeDailyTask(code);
    if (res?.newly_completed) {
      toast.success('✅ أنجزت مهمة يومية! تحقق من صفحة المكافآت');
      if (res.bonus_xp_awarded > 0) {
        toast.success(`🎉 مكافأة +${res.bonus_xp_awarded} XP لإنجاز 3 مهام!`);
      }
      // إعلام أي مستمع (صفحة المكافآت) لإعادة الجلب
      window.dispatchEvent(new CustomEvent('gamification:refresh'));
    }
  } catch (err) {
    // لا يجب أن نزعج المستخدم إذا فشلت المهمة في الخلفية
    console.warn('[dailyTasks] failed to mark task', code, err);
    inFlight.delete(key);
  }
}
