import React, { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useStoryHighlights } from '@/hooks/useStoryHighlights';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Heart, Star, Trash2, Image as ImageIcon, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toast } from 'sonner';

interface ArchivedStory {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

interface Liker {
  user_id: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
}

const ARCHIVE_STALE_MS = 5 * 60 * 1000; // 5 دقائق

const fetchArchiveData = async (userId: string) => {
  const { data: storyRows, error } = await supabase
    .from('stories')
    .select('id, media_url, media_type, caption, created_at, expires_at, is_active')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const stories = (storyRows ?? []) as ArchivedStory[];

  const ids = stories.map((s) => s.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: likes } = await supabase
      .from('story_likes')
      .select('story_id')
      .in('story_id', ids);
    (likes ?? []).forEach((l: any) => {
      counts[l.story_id] = (counts[l.story_id] ?? 0) + 1;
    });
  }
  return { stories, likeCounts: counts };
};

const StoryArchive: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { highlights, loading: hlLoading, deleteHighlight } = useStoryHighlights();
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [likers, setLikers] = useState<Liker[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['story-archive', user?.id],
    queryFn: () => fetchArchiveData(user!.id),
    enabled: !!user,
    staleTime: ARCHIVE_STALE_MS,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const stories = data?.stories ?? [];
  const likeCounts = data?.likeCounts ?? {};

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['story-archive', user?.id] });
  }, [queryClient, user?.id]);

  const openLikers = useCallback(async (storyId: string) => {
    setOpenStoryId(storyId);
    setLikersLoading(true);
    const { data: likes, error } = await supabase
      .from('story_likes')
      .select('user_id, created_at')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setLikers([]);
      setLikersLoading(false);
      return;
    }

    const userIds = (likes ?? []).map((l: any) => l.user_id);
    const profilesMap: Record<string, { username: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);
      (profiles ?? []).forEach((p: any) => {
        profilesMap[p.id] = { username: p.username, avatar_url: p.avatar_url };
      });
    }

    setLikers(
      (likes ?? []).map((l: any) => ({
        user_id: l.user_id,
        created_at: l.created_at,
        username: profilesMap[l.user_id]?.username ?? null,
        avatar_url: profilesMap[l.user_id]?.avatar_url ?? null,
      })),
    );
    setLikersLoading(false);
  }, []);

  const handleDeleteStory = async (storyId: string) => {
    if (!confirm('هل تريد حذف هذا الستوري نهائياً؟')) return;
    const { error } = await supabase.from('stories').delete().eq('id', storyId);
    if (error) {
      toast.error('تعذر الحذف');
      return;
    }
    toast.success('تم الحذف');
    invalidate();
  };

  const handleDeleteHighlight = async (id: string) => {
    if (!confirm('هل تريد حذف هذا الـ Highlight؟')) return;
    await deleteHighlight(id);
  };

  return (
    <div className="space-y-8" dir="rtl">
      {/* Highlights Section */}
      <section>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" /> الـ Highlights المحفوظة
        </h3>
        {hlLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : highlights.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد Highlights بعد.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {highlights.map((h) => (
              <div key={h.id} className="relative group rounded-lg border bg-card p-3 flex flex-col items-center text-center">
                {h.cover_url ? (
                  <img src={h.cover_url} alt={h.title} className="w-16 h-16 rounded-full object-cover mb-2" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Star className="w-7 h-7 text-primary" />
                  </div>
                )}
                <p className="text-sm font-medium truncate w-full">{h.title}</p>
                <p className="text-xs text-muted-foreground">{h.items_count ?? 0} قصة</p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 left-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition"
                  onClick={() => handleDeleteHighlight(h.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stories Section */}
      <section>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary" /> أرشيف الستوريات
        </h3>
        {isLoading && stories.length === 0 ? (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : stories.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم تنشر أي ستوري بعد.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {stories.map((s) => {
              const isExpired = new Date(s.expires_at).getTime() < Date.now() || !s.is_active;
              return (
                <div key={s.id} className="relative group rounded-lg overflow-hidden border bg-card">
                  <div className="aspect-[9/16] bg-muted relative">
                    {s.media_type === 'video' ? (
                      <video src={s.media_url} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={s.media_url} alt={s.caption ?? ''} className="w-full h-full object-cover" />
                    )}
                    {s.media_type === 'video' && (
                      <Video className="absolute top-2 right-2 w-4 h-4 text-white drop-shadow" />
                    )}
                    {isExpired && (
                      <span className="absolute top-2 left-2 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                        منتهٍ
                      </span>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ar })}
                    </p>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        onClick={() => openLikers(s.id)}
                        className="flex items-center gap-1 text-xs text-pink-600 hover:underline"
                      >
                        <Heart className="w-3.5 h-3.5 fill-current" />
                        {likeCounts[s.id] ?? 0}
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => handleDeleteStory(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Likers Dialog */}
      <Dialog open={!!openStoryId} onOpenChange={(o) => !o && setOpenStoryId(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-600 fill-current" />
              المعجبون ({likers.length})
            </DialogTitle>
          </DialogHeader>
          {likersLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : likers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا يوجد إعجابات بعد.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2">
              {likers.map((l) => (
                <div key={l.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                  {l.avatar_url ? (
                    <img src={l.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      {(l.username ?? '؟').charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.username ?? 'مستخدم'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: ar })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoryArchive;
