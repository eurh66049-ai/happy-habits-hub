import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { publishConversationPreviewUpdate } from '@/hooks/useConversations';

type MessagesCacheEntry = {
  messages: Message[];
  fetchedAt: number;
};

// كاش داخل الذاكرة لمنع إعادة الجلب عند الرجوع بسرعة
const MESSAGES_STALE_MS = 15_000;
const messagesCache = new Map<string, MessagesCacheEntry>();

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  message_type?: string | null;
  audio_url?: string | null;
  audio_mime_type?: string | null;
  audio_duration_ms?: number | null;
  transcript?: string | null;
  sender_profile?: {
    username: string;
    avatar_url: string | null;
  };
  reactions?: MessageReaction[];
}

export const useMessages = (conversationId: string | null) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cacheKey = conversationId ? `${conversationId}` : null;

  // تحميل سريع من الكاش عند توفره
  useEffect(() => {
    if (!cacheKey) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const cached = messagesCache.get(cacheKey);
    if (cached) {
      setMessages(cached.messages);
      setLoading(false);
    }
  }, [cacheKey]);

  const fetchMessages = useCallback(async (options?: { force?: boolean; silent?: boolean }) => {
    if (!conversationId || !userId) return;

    const key = `${conversationId}`;
    const cached = messagesCache.get(key);
    const isFresh = !!cached && Date.now() - cached.fetchedAt < MESSAGES_STALE_MS;
    if (!options?.force && isFresh) {
      return;
    }

    if (!options?.silent) {
      const hasData = (cached?.messages?.length ?? 0) > 0;
      setLoading(!hasData);
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender_profile:profiles!messages_sender_id_fkey(username, avatar_url),
          reactions:message_reactions(id, message_id, user_id, emoji, created_at)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const nextMessages = (data || []) as Message[];
      setMessages(nextMessages);
      messagesCache.set(`${conversationId}`, { messages: nextMessages, fetchedAt: Date.now() });

      // وضع علامة مقروء على الرسائل المستقبلة
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', userId)
        .eq('is_read', false);

    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, userId]);

  // إرسال رسالة
  const sendMessage = useCallback(async (
    content: string,
    extras?: {
      message_type?: 'text' | 'audio';
      audio_url?: string | null;
      audio_mime_type?: string | null;
      audio_duration_ms?: number | null;
      transcript?: string | null;
    },
  ) => {
    if (!conversationId || !userId) return false;
    const isAudio = extras?.message_type === 'audio';
    if (!isAudio && !content.trim()) return false;

    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: userId,
      content: isAudio ? (content || '') : content.trim(),
      is_read: false,
      created_at: new Date().toISOString(),
      message_type: extras?.message_type || 'text',
      audio_url: extras?.audio_url ?? null,
      audio_mime_type: extras?.audio_mime_type ?? null,
      audio_duration_ms: extras?.audio_duration_ms ?? null,
      transcript: extras?.transcript ?? null,
      sender_profile: { username: 'أنت', avatar_url: null }
    };

    // Optimistic update
    setMessages(prev => [...prev, tempMessage]);

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: isAudio ? (content || '') : content.trim(),
          message_type: extras?.message_type || 'text',
          audio_url: extras?.audio_url ?? null,
          audio_mime_type: extras?.audio_mime_type ?? null,
          audio_duration_ms: extras?.audio_duration_ms ?? null,
          transcript: extras?.transcript ?? null,
        })
        .select(`
          *,
          sender_profile:profiles!messages_sender_id_fkey(username, avatar_url)
        `)
        .single();

      if (error) throw error;

      publishConversationPreviewUpdate(userId, {
        conversation_id: conversationId,
        content: data.content,
        sender_id: data.sender_id,
        created_at: data.created_at,
        message_type: data.message_type,
        transcript: data.transcript,
        audio_url: data.audio_url,
      });

      // استبدال الرسالة المؤقتة بالحقيقية
      setMessages(prev => {
        const next = prev.map(m => m.id === tempId ? data : m);
        messagesCache.set(`${conversationId}`, { messages: next, fetchedAt: Date.now() });
        return next;
      });
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      // إزالة الرسالة المؤقتة عند الخطأ
      setMessages(prev => {
        const next = prev.filter(m => m.id !== tempId);
        messagesCache.set(`${conversationId}`, { messages: next, fetchedAt: Date.now() });
        return next;
      });
      return false;
    } finally {
      setSending(false);
    }
  }, [conversationId, userId]);

  // وضع علامة مقروء
  const markAsRead = useCallback(async () => {
    if (!conversationId || !userId) return;

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .eq('is_read', false);
  }, [conversationId, userId]);

  // حذف رسالة (للمرسل فقط - مع تطبيق RLS)
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!conversationId || !userId) return false;
    const prevSnapshot = messages;
    setMessages(prev => {
      const next = prev.filter(m => m.id !== messageId);
      messagesCache.set(`${conversationId}`, { messages: next, fetchedAt: Date.now() });
      return next;
    });
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', userId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error deleting message:', err);
      setMessages(prevSnapshot);
      messagesCache.set(`${conversationId}`, { messages: prevSnapshot, fetchedAt: Date.now() });
      return false;
    }
  }, [conversationId, userId, messages]);

  // تبديل التفاعل: إيموجي واحد لكل مستخدم لكل رسالة
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!userId) return;
    const target = messages.find(m => m.id === messageId);
    const existing = target?.reactions?.find(r => r.user_id === userId);

    if (existing) {
      setMessages(prev => prev.map(m => m.id === messageId ? {
        ...m,
        reactions: (m.reactions || []).filter(r => r.user_id !== userId),
      } : m));
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId);
      if (error) console.error('remove reaction error', error);
      if (existing.emoji === emoji) return;
    }

    const tempReaction: MessageReaction = {
      id: `temp-${Date.now()}`,
      message_id: messageId,
      user_id: userId,
      emoji,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => prev.map(m => m.id === messageId ? {
      ...m,
      reactions: [...((m.reactions || []).filter(r => r.user_id !== userId)), tempReaction],
    } : m));
    const { data, error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: userId, emoji })
      .select()
      .single();
    if (error) {
      console.error('add reaction error', error);
      setMessages(prev => prev.map(m => m.id === messageId ? {
        ...m,
        reactions: (m.reactions || []).filter(r => r.id !== tempReaction.id),
      } : m));
      return;
    }
    setMessages(prev => prev.map(m => m.id === messageId ? {
      ...m,
      reactions: (m.reactions || []).map(r => r.id === tempReaction.id ? (data as MessageReaction) : r),
    } : m));
  }, [userId, messages]);

  // الاستماع للرسائل الجديدة
  useEffect(() => {
    if (!conversationId || !userId) return;

    // الجلب الأول: سيُتخطى تلقائياً إذا كان الكاش حديثاً
    fetchMessages();

    // إلغاء الاشتراك القديم
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    channelRef.current = supabase
      .channel(`messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async (payload) => {
          // جلب الرسالة الجديدة مع بيانات المرسل
          const { data: newMessage } = await supabase
            .from('messages')
            .select(`
              *,
              sender_profile:profiles!messages_sender_id_fkey(username, avatar_url)
            `)
            .eq('id', payload.new.id)
            .single();

          if (newMessage) {
            setMessages(prev => {
              // تجنب التكرار
              if (prev.some(m => m.id === newMessage.id)) return prev;
              const next = [...prev, newMessage];
              messagesCache.set(`${conversationId}`, { messages: next, fetchedAt: Date.now() });
              return next;
            });

            // وضع علامة مقروء إذا كانت الرسالة من الآخر
            if (newMessage.sender_id !== userId) {
              await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('id', newMessage.id);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const updatedMessage = payload.new as Pick<Message, 'id' | 'is_read'>;
          // تحديث حالة القراءة في الوقت الفعلي
          setMessages(prev => {
            const next = prev.map(m => m.id === updatedMessage.id 
              ? { ...m, is_read: updatedMessage.is_read } 
              : m
            );
            messagesCache.set(`${conversationId}`, { messages: next, fetchedAt: Date.now() });
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages(prev => {
            const next = prev.filter(m => m.id !== deletedId);
            messagesCache.set(`${conversationId}`, { messages: next, fetchedAt: Date.now() });
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const row = (payload.new || payload.old) as MessageReaction;
          if (!row || !row.message_id) return;
          setMessages(prev => {
            if (!prev.some(m => m.id === row.message_id)) return prev;
            const next = prev.map(m => {
              if (m.id !== row.message_id) return m;
              const current = (m.reactions || []).filter(r => !r.id.startsWith('temp-'));
              if (payload.eventType === 'DELETE') {
                return { ...m, reactions: current.filter(r => r.id !== row.id) };
              }
              if (payload.eventType === 'INSERT') {
                if (current.some(r => r.id === row.id)) return m;
                return { ...m, reactions: [...current.filter(r => r.user_id !== row.user_id), row] };
              }
              if (payload.eventType === 'UPDATE') {
                return { ...m, reactions: current.map(r => r.id === row.id ? row : r) };
              }
              return m;
            });
            messagesCache.set(`${conversationId}`, { messages: next, fetchedAt: Date.now() });
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [conversationId, userId, fetchMessages]);

  return {
    messages,
    loading,
    sending,
    sendMessage,
    deleteMessage,
    toggleReaction,
    markAsRead,
    refetch: fetchMessages,
  };
};
