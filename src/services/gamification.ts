// خدمة نظام التحفيز (Gamification) — تستدعي RPCs آمنة في Supabase
import { supabase } from '@/integrations/supabase/client';

export type DailyTaskCode = 'read_new_book' | 'add_review' | 'add_to_reading_list' | 'share_quote';
export type ShopCategory = 'name_color' | 'avatar_frame' | 'badge' | 'comment_highlight' | 'profile_background';
export type BookCompletionMethod = 'auto_95pct' | 'manual' | 'time_based';

export interface LevelInfo {
  level: number;
  name: string;
  min_xp: number;
  next_xp: number | null;
}

export interface GamificationState {
  user_id: string;
  xp: number;
  coins: number;
  level: LevelInfo;
  current_streak: number;
  longest_streak: number;
  last_daily_claim_date: string | null;
  can_claim_daily: boolean;
  selected_name_color: string | null;
  selected_avatar_frame: string | null;
  selected_profile_background: string | null;
  selected_badge: string | null;
  selected_comment_highlight: string | null;
  daily_tasks: Array<{
    code: DailyTaskCode;
    title_ar: string;
    description_ar: string | null;
    xp_reward: number;
    sort_order: number;
  }>;
  daily_tasks_completed: DailyTaskCode[];
  badges: Array<{ code: string; title_ar: string; description_ar: string | null; icon: string | null; awarded_at: string }>;
  purchases: Array<{ item_id: string; code: string; category: ShopCategory; title_ar: string; preview_value: string | null; purchased_at: string }>;
}

export interface ShopItem {
  id: string;
  code: string;
  category: ShopCategory;
  title_ar: string;
  description_ar: string | null;
  price_coins: number;
  preview_value: string | null;
  sort_order: number;
}

export interface LeaderboardEntry {
  user_id: string;
  total_xp: number;
  current_streak: number | null;
  username: string | null;
  avatar_url: string | null;
  selected_name_color: string | null;
  selected_avatar_frame: string | null;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const gamification = {
  getMyState: () => rpc<GamificationState>('gam_get_my_state'),
  claimDailyLogin: () => rpc<{ claimed: boolean; xp_awarded?: number; coins_awarded?: number; new_streak?: number; milestone_badge?: string | null; reason?: string; current_streak?: number }>('gam_claim_daily_login'),
  awardFinishBook: (bookId: string, method: BookCompletionMethod = 'auto_95pct', progress?: number, seconds?: number) =>
    rpc<{ awarded: boolean; xp_awarded?: number; coins_awarded?: number; total_books?: number; reason?: string }>(
      'gam_award_finish_book',
      { _book_id: bookId, _method: method, _progress: progress ?? null, _seconds: seconds ?? null }
    ),
  awardReadingActivity: (bookId: string) =>
    rpc<{ awarded: boolean; xp_awarded?: number; reason?: string }>('gam_award_reading_activity', { _book_id: bookId }),
  completeDailyTask: (code: DailyTaskCode) =>
    rpc<{ newly_completed: boolean; tasks_done_today: number; bonus_xp_awarded: number }>(
      'gam_complete_daily_task',
      { _task_code: code }
    ),
  purchaseShopItem: (itemId: string) =>
    rpc<{ purchased: boolean; item_code: string; price_paid: number }>('gam_purchase_shop_item', { _item_id: itemId }),
  selectCosmetic: (itemId: string) =>
    rpc<{ selected: boolean; category: ShopCategory; value: string }>('gam_select_cosmetic', { _item_id: itemId }),
  clearCosmetic: (category: ShopCategory) =>
    rpc<{ cleared: boolean }>('gam_clear_cosmetic', { _category: category }),
  getLeaderboard: (period: 'week' | 'month' | 'alltime' = 'week', limit = 50) =>
    rpc<LeaderboardEntry[]>('gam_get_leaderboard', { _period: period, _limit: limit }),
  listShopItems: async (): Promise<ShopItem[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('shop_items')
      .select('id,code,category,title_ar,description_ar,price_coins,preview_value,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ShopItem[];
  },
};

// مساعدات للواجهة
export function levelProgress(state: Pick<GamificationState, 'xp' | 'level'>): number {
  const { xp, level } = state;
  if (level.next_xp == null) return 100;
  const total = level.next_xp - level.min_xp;
  const done = xp - level.min_xp;
  return Math.min(100, Math.max(0, (done / total) * 100));
}
