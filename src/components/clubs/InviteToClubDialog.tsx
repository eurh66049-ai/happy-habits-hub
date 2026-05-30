import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, UserPlus, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useInviteToClub } from '@/hooks/useClubInvitations';
import { useAuth } from '@/context/AuthContext';

interface InviteToClubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
}

interface UserRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

const InviteToClubDialog: React.FC<InviteToClubDialogProps> = ({ open, onOpenChange, clubId }) => {
  const { user } = useAuth();
  const { inviteUser, sending } = useInviteToClub(clubId);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const term = search.trim();
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let q = supabase.from('profiles').select('id, username, avatar_url').limit(30);
        if (term.length > 0) {
          q = q.ilike('username', `%${term}%`);
        } else {
          q = q.order('created_at', { ascending: false });
        }
        const { data, error } = await q;
        if (error) throw error;
        if (!cancelled) setUsers((data || []).filter(u => u.id !== user?.id) as UserRow[]);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, search, user?.id]);

  const handleInvite = async (u: UserRow) => {
    const ok = await inviteUser(u.id);
    if (ok) setInvited(prev => new Set(prev).add(u.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            دعوة أعضاء للنادي
          </DialogTitle>
          <DialogDescription>
            ابحث عن المستخدمين بالاسم وأرسل لهم دعوة للانضمام لنادي القراءة الخاص.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث باسم المستخدم..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>

        <ScrollArea className="h-72 border rounded-lg mt-2">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">جاري البحث...</div>
          ) : users.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
          ) : (
            <div className="p-1">
              {users.map(u => {
                const isInvited = invited.has(u.id);
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={u.avatar_url || ''} />
                      <AvatarFallback>{u.username?.[0] || '؟'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{u.username || 'مستخدم'}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={isInvited ? 'secondary' : 'default'}
                      disabled={isInvited || sending}
                      onClick={() => handleInvite(u)}
                    >
                      {isInvited ? (
                        <>
                          <Check className="h-3.5 w-3.5 ml-1" /> تمت الدعوة
                        </>
                      ) : (
                        'دعوة'
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default InviteToClubDialog;
