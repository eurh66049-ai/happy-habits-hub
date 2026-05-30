import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { createNotificationWithPush } from '@/utils/pushNotification';
import { toast } from 'sonner';


export interface ClubInvitation {
  id: string;
  club_id: string;
  invited_user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  club?: {
    id: string;
    name: string;
    book_title: string;
    book_cover_url: string | null;
  };
  inviter?: {
    username: string | null;
    avatar_url: string | null;
  };
}

const invitationsKey = (userId: string | undefined) => ['club-invitations', userId ?? null];

/** قائمة الدعوات الواردة للمستخدم الحالي (المعلقة فقط). */
export const useMyClubInvitations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: invitations = [], isLoading: loading, refetch } = useQuery({
    queryKey: invitationsKey(user?.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ClubInvitation[]> => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('reading_club_invitations')
        .select('*')
        .eq('invited_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      if (rows.length === 0) return [];

      const clubIds = [...new Set(rows.map(r => r.club_id))];
      const inviterIds = [...new Set(rows.map(r => r.invited_by))];

      const [{ data: clubs }, { data: profiles }] = await Promise.all([
        clubIds.length
          ? supabase
              .from('reading_clubs')
              .select('id, name, book_title, book_cover_url')
              .in('id', clubIds)
          : Promise.resolve({ data: [] as any[] }),
        inviterIds.length
          ? supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .in('id', inviterIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      return rows.map(r => ({
        ...r,
        club: clubs?.find((c: any) => c.id === r.club_id),
        inviter: profiles?.find((p: any) => p.id === r.invited_by),
      }));
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: invitationsKey(user?.id) });
  }, [queryClient, user?.id]);

  const acceptInvitation = async (invitation: ClubInvitation) => {
    if (!user) return false;
    try {
      const { error: memberErr } = await supabase
        .from('reading_club_members')
        .insert({ club_id: invitation.club_id, user_id: user.id, role: 'member' });
      if (memberErr && (memberErr as any).code !== '23505') throw memberErr;

      const { error: updErr } = await (supabase as any)
        .from('reading_club_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation.id);
      if (updErr) throw updErr;

      toast.success('تم قبول الدعوة والانضمام للنادي 🎉');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['reading-clubs'] });
      return true;
    } catch (e) {
      console.error('Error accepting invitation:', e);
      toast.error('فشل قبول الدعوة');
      return false;
    }
  };

  const rejectInvitation = async (invitation: ClubInvitation) => {
    try {
      const { error } = await (supabase as any)
        .from('reading_club_invitations')
        .update({ status: 'rejected' })
        .eq('id', invitation.id);
      if (error) throw error;
      toast.success('تم رفض الدعوة');
      invalidate();
      return true;
    } catch (e) {
      console.error('Error rejecting invitation:', e);
      toast.error('فشل رفض الدعوة');
      return false;
    }
  };

  return { invitations, loading, acceptInvitation, rejectInvitation, refetch };
};

/** دعوة مستخدم بواسطة مالك النادي. */
export const useInviteToClub = (clubId: string) => {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);

  const inviteUser = async (invitedUserId: string) => {
    if (!user) {
      toast.error('يجب تسجيل الدخول');
      return false;
    }
    if (invitedUserId === user.id) {
      toast.error('لا يمكنك دعوة نفسك');
      return false;
    }
    try {
      setSending(true);
      const { error } = await (supabase as any)
        .from('reading_club_invitations')
        .insert({
          club_id: clubId,
          invited_user_id: invitedUserId,
          invited_by: user.id,
          status: 'pending',
        });
      if (error) {
        if ((error as any).code === '23505') {
          toast.error('تم دعوة هذا المستخدم مسبقاً');
        } else {
          throw error;
        }
        return false;
      }

      // إرسال إشعار + push للمستخدم المدعو
      try {
        const [{ data: club }, { data: inviterProfile }] = await Promise.all([
          supabase.from('reading_clubs').select('name, book_title').eq('id', clubId).single(),
          supabase.from('profiles').select('username').eq('id', user.id).single(),
        ]);
        const inviterName = inviterProfile?.username || 'مستخدم';
        const clubName = club?.name || 'نادي قراءة';
        await createNotificationWithPush(
          invitedUserId,
          '📩 دعوة إلى نادي قراءة',
          `دعاك ${inviterName} للانضمام إلى نادي "${clubName}"`,
          {
            type: 'club_invitation',
            targetUrl: '/reading-clubs',
          },
        );
      } catch (notifErr) {
        console.warn('[Invite] notification failed (non-blocking):', notifErr);
      }

      toast.success('تم إرسال الدعوة ✉️');
      return true;

    } catch (e) {
      console.error('Error inviting user:', e);
      toast.error('فشل إرسال الدعوة');
      return false;
    } finally {
      setSending(false);
    }
  };

  return { inviteUser, sending };
};
