import React, { useEffect, useState } from 'react';
import { Gift, X } from 'lucide-react';
import { useGamificationState, useClaimDailyLogin } from '@/hooks/useGamification';
import { Button } from '@/components/ui/button';

/**
 * مودال تلقائي يُعرض مرة واحدة في اليوم لتذكير المستخدم باستلام مكافأته اليومية.
 */
const DailyLoginModal: React.FC = () => {
  const { data } = useGamificationState();
  const claim = useClaimDailyLogin();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data?.can_claim_daily) return;
    const today = new Date().toISOString().slice(0, 10);
    const seen = localStorage.getItem('kotobi_daily_modal_seen');
    if (seen === today) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [data?.can_claim_daily]);

  const close = () => {
    setOpen(false);
    localStorage.setItem('kotobi_daily_modal_seen', new Date().toISOString().slice(0, 10));
  };

  if (!open || !data?.can_claim_daily) return null;

  const nextStreak = (data.current_streak ?? 0) + 1;
  const xpPreview =
    nextStreak >= 30 ? 300 : nextStreak >= 7 ? 50 : nextStreak === 3 ? 20 : nextStreak === 2 ? 15 : 10;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
      <div className="relative bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-amber-200 dark:border-amber-800">
        <button
          onClick={close}
          className="absolute top-3 left-3 text-muted-foreground hover:text-foreground"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="text-6xl mb-3 animate-bounce">🎁</div>
          <h2 className="text-2xl font-bold mb-2">مكافأة اليوم في انتظارك!</h2>
          <p className="text-sm text-muted-foreground mb-4">
            استلم <span className="font-bold text-amber-600">+{xpPreview} XP</span> واحفظ سلسلتك ({nextStreak} يوم)
          </p>
          <Button
            size="lg"
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold"
            onClick={async () => {
              await claim.mutateAsync();
              close();
            }}
            disabled={claim.isPending}
          >
            <Gift className="ml-2" />
            استلام الآن
          </Button>
          <button onClick={close} className="text-xs text-muted-foreground mt-3 hover:underline">
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  );
};

export default DailyLoginModal;
