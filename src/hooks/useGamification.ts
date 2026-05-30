import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { gamification, type DailyTaskCode, type ShopCategory, type BookCompletionMethod } from '@/services/gamification';
import { useAuth } from '@/context/AuthContext';

const KEY = ['gamification', 'state'] as const;

export function useGamificationState() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [...KEY, user?.id ?? 'anon'],
    queryFn: () => gamification.getMyState(),
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // الاستماع لإكمال المهام اليومية من باقي التطبيق وإعادة الجلب فوراً
  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] });
    window.addEventListener('gamification:refresh', handler);
    return () => window.removeEventListener('gamification:refresh', handler);
  }, [qc, user?.id]);

  return query;
}

export function useShopItems() {
  return useQuery({
    queryKey: ['gamification', 'shop'],
    queryFn: () => gamification.listShopItems(),
    staleTime: 5 * 60_000,
  });
}

export function useLeaderboard(period: 'week' | 'month' | 'alltime' = 'week') {
  return useQuery({
    queryKey: ['gamification', 'leaderboard', period],
    queryFn: () => gamification.getLeaderboard(period, 50),
    staleTime: 60_000,
  });
}

export function useClaimDailyLogin() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () => gamification.claimDailyLogin(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] });
      if (data.claimed) {
        toast.success(`🎁 +${data.xp_awarded} XP +${data.coins_awarded} 🪙 (سلسلة ${data.new_streak} يوم)`);
        if (data.milestone_badge) {
          toast.success(`🏅 حصلت على شارة جديدة!`);
        }
      }
    },
    onError: (e: unknown) => toast.error('تعذّر استلام المكافأة'),
  });
}

export function useCompleteDailyTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (code: DailyTaskCode) => gamification.completeDailyTask(code),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] });
      if (data.newly_completed) {
        toast.success('✅ تم إنجاز المهمة');
        if (data.bonus_xp_awarded > 0) {
          toast.success(`🎉 مكافأة +${data.bonus_xp_awarded} XP لإنجاز 3 مهام!`);
        }
      }
    },
  });
}

export function useAwardFinishBook() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { bookId: string; method?: BookCompletionMethod; progress?: number; seconds?: number }) =>
      gamification.awardFinishBook(args.bookId, args.method, args.progress, args.seconds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] });
      if (data.awarded) {
        toast.success(`🎉 أنهيت كتاباً! +${data.xp_awarded} XP +${data.coins_awarded} 🪙`);
      }
    },
  });
}

export function useAwardReadingActivity() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (bookId: string) => gamification.awardReadingActivity(bookId),
    onSuccess: (data) => {
      if (data.awarded) {
        qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] });
      }
    },
  });
}

export function usePurchaseShopItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (itemId: string) => gamification.purchaseShopItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] });
      toast.success('🛍️ تم الشراء بنجاح');
    },
    onError: (e: { message?: string }) => {
      const msg = e?.message ?? '';
      if (msg.includes('insufficient_coins')) toast.error('رصيدك من العملات غير كافٍ');
      else if (msg.includes('already_owned')) toast.error('تمتلك هذا العنصر بالفعل');
      else toast.error('فشل الشراء');
    },
  });
}

export function useSelectCosmetic() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (itemId: string) => gamification.selectCosmetic(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] });
      toast.success('✨ تم التطبيق');
    },
  });
}

export function useClearCosmetic() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (category: ShopCategory) => gamification.clearCosmetic(category),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, user?.id ?? 'anon'] }),
  });
}
