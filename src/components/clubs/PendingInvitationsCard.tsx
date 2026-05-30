import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Check, X } from 'lucide-react';
import { useMyClubInvitations } from '@/hooks/useClubInvitations';
import { optimizeImageUrl } from '@/utils/imageProxy';
import { useNavigate } from 'react-router-dom';

const PendingInvitationsCard: React.FC = () => {
  const navigate = useNavigate();
  const { invitations, loading, acceptInvitation, rejectInvitation } = useMyClubInvitations();

  if (loading || invitations.length === 0) return null;

  return (
    <Card className="p-4 mb-6 border-primary/30 bg-primary/5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        دعوات معلقة ({invitations.length})
      </h3>
      <div className="space-y-3">
        {invitations.map(inv => (
          <div
            key={inv.id}
            className="flex items-center gap-3 p-3 bg-background rounded-lg border"
          >
            <img
              src={optimizeImageUrl(inv.club?.book_cover_url || '/placeholder.svg', 'cover')}
              alt=""
              className="w-10 h-14 object-cover rounded shadow-sm flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium line-clamp-1">{inv.club?.name || 'نادي'}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                📖 {inv.club?.book_title}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={inv.inviter?.avatar_url || ''} />
                  <AvatarFallback className="text-[8px]">
                    {inv.inviter?.username?.[0] || '؟'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  دعاك {inv.inviter?.username || 'مستخدم'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button
                size="sm"
                className="h-8"
                onClick={async () => {
                  const ok = await acceptInvitation(inv);
                  if (ok) navigate(`/reading-clubs/${inv.club_id}`);
                }}
              >
                <Check className="h-3.5 w-3.5 ml-1" />
                قبول
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => rejectInvitation(inv)}
              >
                <X className="h-3.5 w-3.5 ml-1" />
                رفض
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default PendingInvitationsCard;
