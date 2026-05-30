import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { KOTOBI_AI_USER_ID, resolveKotobiAiAvatar } from '@/utils/kotobiAi';

type ConversationsCacheEntry = {
  conversations: Conversation[];
  totalUnread: number;
  fetchedAt: number;
};

type MessagePreviewRow = {
  id?: string;
  conversation_id: string;
  content: string | null;
  sender_id: string;
  created_at: string;
  message_type?: string | null;
  transcript?: string | null;
  audio_url?: string | null;
};

// كاش داخل الذاكرة لمنع إعادة الجلب عند الرجوع بسرعة
const CONVERSATIONS_STALE_MS = 60_000;
const conversationsCache = new Map<string, ConversationsCacheEntry>();

export interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  created_at: string;
  last_message_at: string;
  other_user?: {
    id: string;
    username: string;
    avatar_url: string | null;
    last_seen?: string | null;
  };
  last_message?: {
    content: string;
    sender_id: string;
    created_at: string;
  };
  unread_count: number;
}

const getLastMessagePreview = (message?: MessagePreviewRow | null) => {
  if (!message) return undefined;

  return {
    sender_id: message.sender_id,
    created_at: message.created_at,
    content:
      (message.content && message.content.trim()) ||
      (message.transcript && message.transcript.trim()) ||
      (message.message_type === 'audio' || message.message_type === 'voice' || message.audio_url
        ? '🎤 رسالة صوتية'
        : ''),
  };
};

const sortByLatestActivity = (items: Conversation[]) =>
  [...items].sort((a, b) => {
    const aTime = new Date(a.last_message?.created_at || a.last_message_at || a.created_at).getTime();
    const bTime = new Date(b.last_message?.created_at || b.last_message_at || b.created_at).getTime();
    return bTime - aTime;
  });

export const publishConversationPreviewUpdate = (currentUserId: string, message: MessagePreviewRow) => {
  const cached = conversationsCache.get(currentUserId);
  if (cached) {
    const nextConversations = sortByLatestActivity(
      cached.conversations.map((conv) =>
        conv.id === message.conversation_id
          ? {
              ...conv,
              last_message: getLastMessagePreview(message),
              last_message_at: message.created_at,
            }
          : conv,
      ),
    );
    conversationsCache.set(currentUserId, {
      conversations: nextConversations,
      totalUnread: cached.totalUnread,
      fetchedAt: Date.now(),
    });
  }

  window.dispatchEvent(new CustomEvent('kotobi:conversation-preview', { detail: { currentUserId, message } }));
};

export const useConversations = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  // تحميل سريع من الكاش عند توفره
  useEffect(() => {
    if (!userId) {
      setConversations([]);
      setTotalUnread(0);
      setLoading(false);
      return;
    }

    const cached = conversationsCache.get(userId);
    if (cached) {
      setConversations(cached.conversations);
      setTotalUnread(cached.totalUnread);
      setLoading(false);
    }
  }, [userId]);

  const [botConvEnsured, setBotConvEnsured] = useState(false);

  // إنشاء محادثة مع البوت تلقائياً إذا لم تكن موجودة
  useEffect(() => {
    if (!userId || userId === KOTOBI_AI_USER_ID || botConvEnsured) return;

    const ensure = async () => {
      try {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .or(
            `and(participant_1.eq.${userId},participant_2.eq.${KOTOBI_AI_USER_ID}),and(participant_1.eq.${KOTOBI_AI_USER_ID},participant_2.eq.${userId})`
          )
          .limit(1);

        if (!existing || existing.length === 0) {
          const { error } = await supabase
            .from('conversations')
            .insert({
              participant_1: userId,
              participant_2: KOTOBI_AI_USER_ID,
              last_message_at: new Date().toISOString()
            });
          if (error) {
            console.error('Failed to create bot conversation:', error);
          } else {
            console.log('✅ Bot conversation created');
          }
        }
      } catch (err) {
        console.error('Error ensuring bot conversation:', err);
      } finally {
        setBotConvEnsured(true);
      }
    };

    ensure();
  }, [userId, botConvEnsured]);

  const fetchConversations = useCallback(async (options?: { force?: boolean; silent?: boolean }) => {
    if (!userId) return;

    const cached = conversationsCache.get(userId);
    const isFresh = !!cached && Date.now() - cached.fetchedAt < CONVERSATIONS_STALE_MS;
    if (!options?.force && isFresh) {
      return;
    }

    if (!options?.silent) {
      const hasData = (cached?.conversations?.length ?? 0) > 0;
      setLoading(!hasData);
    }

    try {

      // استخدام RPC واحد بدل عدة استعلامات (N+1) — يجلب المحادثات + آخر رسالة + عدد غير المقروء في مرة واحدة
      const { data: rpcRows, error } = await supabase.rpc('get_user_conversations', {
        p_user_id: userId,
      });

      if (error) throw error;

      if (!rpcRows || rpcRows.length === 0) {
        setConversations([]);
        setTotalUnread(0);
        conversationsCache.set(userId, { conversations: [], totalUnread: 0, fetchedAt: Date.now() });
        setLoading(false);
        return;
      }

      const enrichedConversations: Conversation[] = (rpcRows as any[]).map((row) => {
        const otherUserId: string = row.participant_id;
        const lastMsgContent: string = row.last_message ?? '';
        return {
          id: row.conversation_id,
          participant_1: userId,
          participant_2: otherUserId,
          created_at: row.last_message_at || new Date().toISOString(),
          last_message_at: row.last_message_at || new Date().toISOString(),
          other_user: {
            id: otherUserId,
            username: row.participant_username || 'مستخدم',
            avatar_url: resolveKotobiAiAvatar({ userId: otherUserId, avatarUrl: row.participant_avatar_url }),
            last_seen: row.last_seen,
          },
          last_message: row.last_message_at
            ? {
                content: lastMsgContent || '🎤 رسالة صوتية',
                sender_id: '',
                created_at: row.last_message_at,
              }
            : undefined,
          unread_count: Number(row.unread_count) || 0,
        };
      });

      const sortedConversations = sortByLatestActivity(enrichedConversations);
      setConversations(sortedConversations);
      const nextTotalUnread = enrichedConversations.reduce((sum, c) => sum + c.unread_count, 0);
      setTotalUnread(nextTotalUnread);

      conversationsCache.set(userId, {
        conversations: sortedConversations,
        totalUnread: nextTotalUnread,
        fetchedAt: Date.now(),
      });
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // الحصول على محادثة مع مستخدم معين
  const getConversationWithUser = useCallback((targetUserId: string) => {
    return conversations.find(c => 
      c.participant_1 === targetUserId || c.participant_2 === targetUserId
    );
  }, [conversations]);

  // الاستماع للتحديثات الفورية
  useEffect(() => {
    if (!userId) return;

    // الجلب الأول أو إعادة الجلب بعد إنشاء محادثة البوت
    fetchConversations({ force: botConvEnsured });

    const channelId = `conversations_${userId}_${Math.random().toString(36).slice(2, 8)}`;
    const applyMessagePreview = (message: MessagePreviewRow) => {
      setConversations((prev) => {
        const messageConversation = prev.find((conv) => conv.id === message.conversation_id);
        if (!messageConversation) return prev;

        const next = sortByLatestActivity(
          prev.map((conv) =>
            conv.id === message.conversation_id
              ? {
                  ...conv,
                  last_message: getLastMessagePreview(message),
                  last_message_at: message.created_at,
                  unread_count:
                    message.sender_id !== userId ? conv.unread_count + 1 : conv.unread_count,
                }
              : conv,
          ),
        );
        const nextTotalUnread = next.reduce((sum, conv) => sum + conv.unread_count, 0);
        conversationsCache.set(userId, { conversations: next, totalUnread: nextTotalUnread, fetchedAt: Date.now() });
        setTotalUnread(nextTotalUnread);
        return next;
      });
    };
    const handleLocalPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ currentUserId: string; message: MessagePreviewRow }>).detail;
      if (detail?.currentUserId === userId) {
        applyMessagePreview(detail.message);
      }
    };

    window.addEventListener('kotobi:conversation-preview', handleLocalPreview);
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const msg = payload.new as MessagePreviewRow;
          // فلترة على العميل: فقط المحادثات التي أشارك فيها
          applyMessagePreview(msg);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('kotobi:conversation-preview', handleLocalPreview);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations, botConvEnsured]);

  return {
    conversations,
    loading,
    totalUnread,
    getConversationWithUser,
    refetch: fetchConversations
  };
};
