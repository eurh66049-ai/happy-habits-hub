
-- ============================================================
-- إصلاحات أمنية حرجة - RLS Policies
-- ============================================================

-- 1) admin_users: منع أي مستخدم من تعيين نفسه كمسؤول
DROP POLICY IF EXISTS "Users insert their admin row" ON public.admin_users;
DROP POLICY IF EXISTS "Users update their admin row" ON public.admin_users;
DROP POLICY IF EXISTS "Users delete their admin row" ON public.admin_users;

CREATE POLICY "Only service_role can insert admin rows"
  ON public.admin_users FOR INSERT TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service_role can update admin rows"
  ON public.admin_users FOR UPDATE TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service_role can delete admin rows"
  ON public.admin_users FOR DELETE TO public
  USING (auth.role() = 'service_role');

-- 2) profiles: إخفاء email عن الزوار المجهولين
REVOKE SELECT (email) ON public.profiles FROM anon;

-- 3) reading_history: إغلاق القراءة العامة
DROP POLICY IF EXISTS "Anyone can view reading history for library" ON public.reading_history;

-- 4) fcm_tokens: منع اختطاف توكنات المستخدمين الآخرين
DROP POLICY IF EXISTS "Authenticated users can update FCM tokens to own them" ON public.fcm_tokens;
CREATE POLICY "Users can update their own FCM tokens"
  ON public.fcm_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5) sitemap_urls: قصر التعديل على service_role/admin
DROP POLICY IF EXISTS "Allow system to insert sitemap urls" ON public.sitemap_urls;
DROP POLICY IF EXISTS "Allow system to update sitemap urls" ON public.sitemap_urls;
DROP POLICY IF EXISTS "Allow system to delete sitemap urls" ON public.sitemap_urls;

CREATE POLICY "Admins manage sitemap urls"
  ON public.sitemap_urls FOR ALL TO public
  USING (auth.role() = 'service_role' OR public.is_current_user_admin())
  WITH CHECK (auth.role() = 'service_role' OR public.is_current_user_admin());

-- 6) dynamic_sitemap
DROP POLICY IF EXISTS "Allow system to manage dynamic sitemap" ON public.dynamic_sitemap;
CREATE POLICY "Admins manage dynamic sitemap"
  ON public.dynamic_sitemap FOR ALL TO public
  USING (auth.role() = 'service_role' OR public.is_current_user_admin())
  WITH CHECK (auth.role() = 'service_role' OR public.is_current_user_admin());

-- 7) canonical_urls
DROP POLICY IF EXISTS "Allow system to manage canonical urls" ON public.canonical_urls;
CREATE POLICY "Admins manage canonical urls"
  ON public.canonical_urls FOR ALL TO public
  USING (auth.role() = 'service_role' OR public.is_current_user_admin())
  WITH CHECK (auth.role() = 'service_role' OR public.is_current_user_admin());

-- 8) authors: منع المستخدمين العاديين من تعديل أي مؤلف
DROP POLICY IF EXISTS "Authors can be updated by authenticated users" ON public.authors;
CREATE POLICY "Authors can be updated by owner or admin"
  ON public.authors FOR UPDATE TO authenticated
  USING (
    public.is_current_user_admin()
    OR (user_id IS NOT NULL AND auth.uid() = user_id)
  )
  WITH CHECK (
    public.is_current_user_admin()
    OR (user_id IS NOT NULL AND auth.uid() = user_id)
  );

-- 9) categories: قصر التعديل على المسؤولين
DROP POLICY IF EXISTS "Categories can be created by authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Categories can be updated by authenticated users" ON public.categories;

CREATE POLICY "Admins can insert categories"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_admin());

CREATE POLICY "Admins can update categories"
  ON public.categories FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- 10) navigation_history: المجهولون يكتبون فقط، لا قراءة جماعية
DROP POLICY IF EXISTS "Anonymous users can manage their session navigation" ON public.navigation_history;
CREATE POLICY "Anonymous can insert navigation"
  ON public.navigation_history FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND session_id IS NOT NULL);
