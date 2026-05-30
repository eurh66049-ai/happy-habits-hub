import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { gamification } from '@/services/gamification';
import { useAuth } from '@/context/AuthContext';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

interface FoundTreasure {
  icon: string;
  title: string;
  message: string;
  xp: number;
  coins: number;
  locationLabel: string;
}

const MysteryDropHunter: React.FC = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const attemptedRef = useRef<Set<string>>(loadAttempted());
  const [found, setFound] = useState<FoundTreasure | null>(null);

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
        const treasure: FoundTreasure = {
          icon: res.icon ?? '💎',
          title: res.title_ar ?? 'كنز مخفي!',
          message: res.message_ar ?? '',
          xp: res.xp_awarded ?? 0,
          coins: res.coins_awarded ?? 0,
          locationLabel: entry.locationLabel,
        };
        setFound(treasure);
        toast.success(`${treasure.icon} اكتشفت كنزاً مخفياً في ${treasure.locationLabel}!`, {
          description: `+${treasure.xp} XP و +${treasure.coins} 🪙`,
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
  }, [pathname, user, qc]);

  if (!found) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
      dir="rtl"
      onClick={() => setFound(null)}
    >
      <div
        className="relative bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 dark:from-amber-950 dark:via-yellow-950 dark:to-orange-950 rounded-2xl shadow-2xl max-w-sm w-full p-6 border-2 border-amber-300 dark:border-amber-700 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setFound(null)}
          className="absolute top-3 left-3 text-muted-foreground hover:text-foreground"
          aria-label="إغلاق"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center">
          <div className="text-6xl mb-3 animate-bounce">{found.icon}</div>
          <div className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-900/60 px-3 py-1 rounded-full mb-3">
            <Sparkles className="h-3 w-3" />
            لقد وجدت كنزاً مخفياً!
          </div>
          <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-2">
            {found.title}
          </h2>
          <p className="text-sm text-amber-800/80 dark:text-amber-200/80 mb-2">
            {found.message}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            🔍 كان الكنز مخفياً في: <span className="font-semibold">{found.locationLabel}</span>
          </p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-white/70 dark:bg-black/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
              <div className="text-xs text-muted-foreground">نقاط الخبرة</div>
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">+{found.xp} XP</div>
            </div>
            <div className="bg-white/70 dark:bg-black/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
              <div className="text-xs text-muted-foreground">العملات</div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">+{found.coins} 🪙</div>
            </div>
          </div>

          <Button
            onClick={() => setFound(null)}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
          >
            رائع! تابع الاستكشاف 🚀
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MysteryDropHunter;