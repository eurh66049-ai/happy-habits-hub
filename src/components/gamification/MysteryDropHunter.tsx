import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { gamification } from '@/services/gamification';
import { useAuth } from '@/context/AuthContext';
import { useNotification } from '@/context/NotificationContext';

/**
 * خريطة الكنوز المخفية حسب المسار. تطابق الأكواد في جدول mystery_drops.
 * عند زيارة المستخدم لهذه المسارات، يحاول النظام بصمت استلام الكنز عبر RPC.
 * الخادم يضمن أن كل كنز يُستلم مرة واحدة فقط لكل مستخدم.
 */
const PATH_DROPS: Array<{ match: RegExp; code: string; locationLabel: string }> = [
  { match: /^\/shop\/?$/, code: 'hidden_shop', locationLabel: 'صفحة المتجر 🛍️' },
  { match: /^\/quotes\/?$/, code: 'hidden_quotes', locationLabel: 'صفحة الاقتباسات ✨' },
  { match: /^\/categories\/?$/, code: 'hidden_categories', locationLabel: 'صفحة التصنيفات 📚' },
  { match: /^\/leaderboard\/?$/, code: 'hidden_leaderboard', locationLabel: 'صفحة المتصدرين 🏆' },
  { match: /^\/authors\/?$/, code: 'hidden_authors', locationLabel: 'صفحة المؤلفين 🖋️' },
];

const SESSION_KEY = 'kotobi_mystery_attempted_v1';

function loadAttempted(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveAttempted(set: Set<string>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

const MysteryDropHunter: React.FC = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { openNotifications, refreshNotifications } = useNotification();
  const attemptedRef = useRef<Set<string>>(loadAttempted());

  useEffect(() => {
    if (!user) return;
    const entry = PATH_DROPS.find((p) => p.match.test(pathname));
    if (!entry) return;
    if (attemptedRef.current.has(entry.code)) return;
    attemptedRef.current.add(entry.code);
    saveAttempted(attemptedRef.current);

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await gamification.claimMysteryDrop(entry.code);
        if (cancelled || !res?.claimed) return;
        refreshNotifications();
        openNotifications();
        toast.success(`${res.icon ?? '💎'} تم إضافة الكنز إلى نافذة الإشعارات`, {
          description: `المكان: ${entry.locationLabel} — +${res.xp_awarded ?? 0} XP و +${res.coins_awarded ?? 0} 🪙`,
          duration: 8000,
        });
        qc.invalidateQueries({ queryKey: ['gamification', 'state'] });
      } catch (e) {
        // فشل صامت — لا نزعج المستخدم
        // eslint-disable-next-line no-console
        console.warn('[MysteryDrop] claim failed', e);
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathname, user, qc, openNotifications, refreshNotifications]);

  return null;
};

export default MysteryDropHunter;