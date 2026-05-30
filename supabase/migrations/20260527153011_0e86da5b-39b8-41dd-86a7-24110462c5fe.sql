
-- Invitations table for private reading clubs
CREATE TABLE public.reading_club_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.reading_clubs(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, invited_user_id)
);

CREATE INDEX idx_rc_invitations_user ON public.reading_club_invitations(invited_user_id);
CREATE INDEX idx_rc_invitations_club ON public.reading_club_invitations(club_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_club_invitations TO authenticated;
GRANT ALL ON public.reading_club_invitations TO service_role;

ALTER TABLE public.reading_club_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own invitations"
ON public.reading_club_invitations FOR SELECT TO authenticated
USING (auth.uid() = invited_user_id OR auth.uid() = invited_by);

CREATE POLICY "Club creators can invite"
ON public.reading_club_invitations FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = invited_by
  AND EXISTS (SELECT 1 FROM public.reading_clubs WHERE id = club_id AND created_by = auth.uid())
);

CREATE POLICY "Invited users can update their invitation"
ON public.reading_club_invitations FOR UPDATE TO authenticated
USING (auth.uid() = invited_user_id);

CREATE POLICY "Inviter or invitee can delete"
ON public.reading_club_invitations FOR DELETE TO authenticated
USING (auth.uid() = invited_user_id OR auth.uid() = invited_by);

-- Update reading_clubs SELECT policy: allow owners, members and invited users to see private clubs
DROP POLICY IF EXISTS "Anyone can view public clubs" ON public.reading_clubs;
DROP POLICY IF EXISTS "View clubs (public, owned, member, invited)" ON public.reading_clubs;

CREATE POLICY "View clubs (public, owned, member, invited)"
ON public.reading_clubs FOR SELECT
USING (
  is_public = true
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.reading_club_members m WHERE m.club_id = reading_clubs.id AND m.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.reading_club_invitations i WHERE i.club_id = reading_clubs.id AND i.invited_user_id = auth.uid() AND i.status = 'pending')
);
