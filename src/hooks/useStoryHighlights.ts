import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

export interface StoryHighlight {
  id: string;
  user_id: string;
  title: string;
  cover_url: string | null;
  created_at: string;
  items_count?: number;
}

export interface StoryHighlightItem {
  id: string;
  highlight_id: string;
  user_id: string;
  story_id: string | null;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  duration: number;
  book_id: string | null;
  book_slug: string | null;
  source_created_at: string | null;
  sort_order: number;
  created_at: string;
}

export const useStoryHighlights = (userId?: string) => {
  const { user } = useAuth();
  const targetUserId = userId ?? user?.id;
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHighlights = useCallback(async () => {
    if (!targetUserId) {
      setHighlights([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('story_highlights')
      .select('id, user_id, title, cover_url, created_at, story_highlight_items(count)')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetch highlights error', error);
      setHighlights([]);
    } else {
      setHighlights(
        (data ?? []).map((h: any) => ({
          id: h.id,
          user_id: h.user_id,
          title: h.title,
          cover_url: h.cover_url,
          created_at: h.created_at,
          items_count: h.story_highlight_items?.[0]?.count ?? 0,
        })),
      );
    }
    setLoading(false);
  }, [targetUserId]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  const createHighlightWithStory = useCallback(
    async (params: {
      title: string;
      story: {
        id: string;
        media_url: string;
        media_type: string;
        caption: string | null;
        duration: number;
        book_id: string | null;
        book_slug: string | null;
        created_at: string;
      };
    }): Promise<string | null> => {
      if (!user) return null;
      const { data: hl, error: hlErr } = await supabase
        .from('story_highlights')
        .insert({
          user_id: user.id,
          title: params.title.trim() || 'مميزة',
          cover_url: params.story.media_type === 'image' ? params.story.media_url : null,
        })
        .select('id')
        .single();
      if (hlErr || !hl) {
        toast.error('تعذر إنشاء Highlight');
        return null;
      }
      const { error: itemErr } = await supabase.from('story_highlight_items').insert({
        highlight_id: hl.id,
        user_id: user.id,
        story_id: params.story.id,
        media_url: params.story.media_url,
        media_type: params.story.media_type,
        caption: params.story.caption,
        duration: params.story.duration,
        book_id: params.story.book_id,
        book_slug: params.story.book_slug,
        source_created_at: params.story.created_at,
        sort_order: 0,
      });
      if (itemErr) {
        toast.error('تعذر حفظ القصة في Highlight');
        return null;
      }
      await fetchHighlights();
      return hl.id;
    },
    [user, fetchHighlights],
  );

  const addStoryToHighlight = useCallback(
    async (highlightId: string, story: {
      id: string;
      media_url: string;
      media_type: string;
      caption: string | null;
      duration: number;
      book_id: string | null;
      book_slug: string | null;
      created_at: string;
    }) => {
      if (!user) return false;
      const { count } = await supabase
        .from('story_highlight_items')
        .select('*', { count: 'exact', head: true })
        .eq('highlight_id', highlightId);

      const { error } = await supabase.from('story_highlight_items').insert({
        highlight_id: highlightId,
        user_id: user.id,
        story_id: story.id,
        media_url: story.media_url,
        media_type: story.media_type,
        caption: story.caption,
        duration: story.duration,
        book_id: story.book_id,
        book_slug: story.book_slug,
        source_created_at: story.created_at,
        sort_order: count ?? 0,
      });
      if (error) {
        toast.error('تعذر إضافة القصة');
        return false;
      }
      await fetchHighlights();
      return true;
    },
    [user, fetchHighlights],
  );

  const deleteHighlight = useCallback(async (id: string) => {
    const { error } = await supabase.from('story_highlights').delete().eq('id', id);
    if (error) {
      toast.error('تعذر الحذف');
      return false;
    }
    await fetchHighlights();
    return true;
  }, [fetchHighlights]);

  const getHighlightItems = useCallback(async (highlightId: string): Promise<StoryHighlightItem[]> => {
    const { data, error } = await supabase
      .from('story_highlight_items')
      .select('*')
      .eq('highlight_id', highlightId)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error(error);
      return [];
    }
    return (data ?? []) as StoryHighlightItem[];
  }, []);

  return {
    highlights,
    loading,
    refresh: fetchHighlights,
    createHighlightWithStory,
    addStoryToHighlight,
    deleteHighlight,
    getHighlightItems,
  };
};
