import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserCosmetics {
  selected_name_color: string | null;
  selected_avatar_frame: string | null;
  selected_badge: string | null;
  selected_comment_highlight: string | null;
  selected_profile_background: string | null;
}

const EMPTY: UserCosmetics = {
  selected_name_color: null,
  selected_avatar_frame: null,
  selected_badge: null,
  selected_comment_highlight: null,
  selected_profile_background: null,
};

export function useUserCosmetics(userId?: string | null) {
  const [data, setData] = useState<UserCosmetics>(EMPTY);

  useEffect(() => {
    if (!userId) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase
        .from('user_gamification')
        .select('selected_name_color, selected_avatar_frame, selected_badge, selected_comment_highlight, selected_profile_background')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      setData({ ...EMPTY, ...(row as any) });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return data;
}
