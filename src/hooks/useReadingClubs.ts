import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';


export interface ReadingClub {
  id: string;
  name: string;
  description: string | null;
  book_id: string;
  book_title: string;
  book_cover_url: string | null;
  book_author: string | null;
  created_by: string;
  max_members: number;
  current_members: number;
  status: string;
  start_date: string;
  end_date: string | null;
  current_page: number;
  is_public: boolean;
  created_at: string;
  creator_username?: string;
  creator_avatar?: string;
  is_member?: boolean;
  book_slug?: string | null;
}

export interface ClubMember {
  id: string;
  club_id: string;
  user_id: string;
  role: string;
  current_page: number;
  joined_at: string;
  last_active_at: string;
  username?: string;
  avatar_url?: string;
}

export interface ClubMessage {
  id: string;
  club_id: string;
  user_id: string;
  content: string;
  page_reference: number | null;
  is_pinned: boolean;
  created_at: string;
  username?: string;
  avatar_url?: string;
}

export const useReadingClubs = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ['reading-clubs', user?.id ?? null],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // RLS exposes: public clubs + clubs owned by user + clubs the user is member of + clubs the user was invited to
      const { data: clubsData, error } = await supabase
        .from('reading_clubs')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const creatorIds = [...new Set(clubsData?.map(c => c.created_by) || [])];
      const { data: profiles } = creatorIds.length
        ? await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', creatorIds)
        : { data: [] as any[] };

      let membershipIds: string[] = [];
      if (user) {
        const { data: memberships } = await supabase
          .from('reading_club_members')
          .select('club_id')
          .eq('user_id', user.id);
        membershipIds = memberships?.map(m => m.club_id) || [];
      }

      const enrichedClubs: ReadingClub[] = (clubsData || []).map(club => {
        const creator = profiles?.find(p => p.id === club.created_by);
        return {
          ...club,
          creator_username: creator?.username || 'مستخدم',
          creator_avatar: creator?.avatar_url,
          is_member: membershipIds.includes(club.id),
        } as ReadingClub;
      });

      return { enrichedClubs, membershipIds };
    },
  });

  const clubs = useMemo(
    () => (data?.enrichedClubs || []).filter(c => c.is_public),
    [data],
  );

  const myClubs = useMemo(() => {
    if (!user || !data) return [] as ReadingClub[];
    const ids = new Set(data.membershipIds);
    return data.enrichedClubs.filter(c => ids.has(c.id) || c.created_by === user.id);
  }, [data, user?.id]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['reading-clubs'] });
  }, [queryClient]);

  const createClub = async (clubData: {
    name: string;
    description?: string;
    book_id: string;
    book_title: string;
    book_cover_url?: string;
    book_author?: string;
    max_members?: number;
    is_public?: boolean;
  }) => {
    if (!user) {
      toast.error('يجب تسجيل الدخول أولاً');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('reading_clubs')
        .insert({
          ...clubData,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('reading_club_members')
        .insert({
          club_id: data.id,
          user_id: user.id,
          role: 'admin'
        });

      toast.success('تم إنشاء النادي بنجاح! 📚');
      invalidate();
      return data;
    } catch (error) {
      console.error('Error creating club:', error);
      toast.error('حدث خطأ في إنشاء النادي');
      return null;
    }
  };

  const joinClub = async (clubId: string) => {
    if (!user) {
      toast.error('يجب تسجيل الدخول أولاً');
      return false;
    }

    try {
      const { error } = await supabase
        .from('reading_club_members')
        .insert({
          club_id: clubId,
          user_id: user.id,
          role: 'member'
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('أنت عضو بالفعل في هذا النادي');
        } else {
          throw error;
        }
        return false;
      }

      toast.success('تم الانضمام للنادي بنجاح! 🎉');
      invalidate();
      return true;
    } catch (error) {
      console.error('Error joining club:', error);
      toast.error('حدث خطأ في الانضمام للنادي');
      return false;
    }
  };

  const leaveClub = async (clubId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('reading_club_members')
        .delete()
        .eq('club_id', clubId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('تم مغادرة النادي');
      invalidate();
      return true;
    } catch (error) {
      console.error('Error leaving club:', error);
      toast.error('حدث خطأ في مغادرة النادي');
      return false;
    }
  };

  const deleteClub = async (clubId: string) => {
    if (!user) return false;

    try {
      const { data: club } = await supabase
        .from('reading_clubs')
        .select('created_by')
        .eq('id', clubId)
        .single();

      if (club?.created_by !== user.id) {
        toast.error('فقط مالك النادي يمكنه حذفه');
        return false;
      }

      await supabase.from('reading_club_messages').delete().eq('club_id', clubId);
      await supabase.from('reading_club_members').delete().eq('club_id', clubId);
      const { error } = await supabase.from('reading_clubs').delete().eq('id', clubId);

      if (error) throw error;

      toast.success('تم حذف النادي بنجاح');
      invalidate();
      return true;
    } catch (error) {
      console.error('Error deleting club:', error);
      toast.error('حدث خطأ في حذف النادي');
      return false;
    }
  };

  return {
    clubs,
    myClubs,
    loading,
    createClub,
    joinClub,
    leaveClub,
    deleteClub,
    refetch: () => refetch(),
  };
};


export const useClubDetails = (clubId: string) => {
  const { user } = useAuth();
  const [club, setClub] = useState<ReadingClub | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);

  const fetchClubDetails = async () => {
    try {
      setLoading(true);

      // جلب تفاصيل النادي
      const { data: clubData, error: clubError } = await supabase
        .from('reading_clubs')
        .select('*')
        .eq('id', clubId)
        .single();

      if (clubError) throw clubError;

      // جلب slug الكتاب
      let bookSlug: string | null = null;
      if (clubData?.book_id) {
        const { data: bookData } = await supabase
          .from('book_submissions')
          .select('slug')
          .eq('id', clubData.book_id)
          .single();
        bookSlug = bookData?.slug || null;
      }

      setClub({ ...clubData, book_slug: bookSlug });

      // جلب الأعضاء
      const { data: membersData, error: membersError } = await supabase
        .from('reading_club_members')
        .select('*')
        .eq('club_id', clubId)
        .order('joined_at', { ascending: true });

      if (membersError) throw membersError;

      // جلب معلومات الأعضاء
      const memberIds = membersData?.map(m => m.user_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', memberIds);

      const enrichedMembers = membersData?.map(member => {
        const profile = profiles?.find(p => p.id === member.user_id);
        return {
          ...member,
          username: profile?.username || 'مستخدم',
          avatar_url: profile?.avatar_url
        };
      }) || [];

      setMembers(enrichedMembers);
      setIsMember(user ? memberIds.includes(user.id) : false);

    } catch (error) {
      console.error('Error fetching club details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const { data: messagesData, error } = await supabase
        .from('reading_club_messages')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // جلب معلومات المرسلين
      const senderIds = [...new Set(messagesData?.map(m => m.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', senderIds);

      const enrichedMessages = messagesData?.map(msg => {
        const profile = profiles?.find(p => p.id === msg.user_id);
        return {
          ...msg,
          username: profile?.username || 'مستخدم',
          avatar_url: profile?.avatar_url
        };
      }) || [];

      setMessages(enrichedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendMessage = async (content: string, pageReference?: number) => {
    if (!user || !isMember) {
      toast.error('يجب أن تكون عضواً في النادي لإرسال الرسائل');
      return false;
    }

    try {
      const { error } = await supabase
        .from('reading_club_messages')
        .insert({
          club_id: clubId,
          user_id: user.id,
          content,
          page_reference: pageReference || null
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('حدث خطأ في إرسال الرسالة');
      return false;
    }
  };

  const updateMyProgress = async (currentPage: number) => {
    if (!user) return;

    try {
      await supabase
        .from('reading_club_members')
        .update({ 
          current_page: currentPage,
          last_active_at: new Date().toISOString()
        })
        .eq('club_id', clubId)
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  // الاشتراك في الرسائل الجديدة (Realtime)
  useEffect(() => {
    if (!clubId || !isMember) return;

    const channel = supabase
      .channel(`club-messages-${clubId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reading_club_messages',
          filter: `club_id=eq.${clubId}`
        },
        async (payload) => {
          const newMessage = payload.new as ClubMessage;
          
          // جلب معلومات المرسل
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newMessage.user_id)
            .single();

          setMessages(prev => [...prev, {
            ...newMessage,
            username: profile?.username || 'مستخدم',
            avatar_url: profile?.avatar_url
          }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clubId, isMember]);

  useEffect(() => {
    if (clubId) {
      fetchClubDetails();
    }
  }, [clubId, user?.id]);


  useEffect(() => {
    if (isMember && clubId) {
      fetchMessages();
    }
  }, [isMember, clubId]);

  return {
    club,
    members,
    messages,
    loading,
    isMember,
    sendMessage,
    updateMyProgress,
    refetch: fetchClubDetails
  };
};
