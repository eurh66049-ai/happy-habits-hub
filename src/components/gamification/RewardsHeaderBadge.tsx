import React from 'react';
import { Link } from 'react-router-dom';
import { Coins, Flame, Gift } from 'lucide-react';
import { useGamificationState } from '@/hooks/useGamification';
import { useAuth } from '@/context/AuthContext';

/**
 * شارة صغيرة لعرض النقاط والسلسلة في الهيدر/التنقل.
 */
const RewardsHeaderBadge: React.FC = () => {
  const { user } = useAuth();
  const { data } = useGamificationState();
  if (!user || !data) return null;

  return (
    <Link
      to="/rewards"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 text-sm font-bold hover:bg-amber-200 dark:hover:bg-amber-900/60 transition relative"
      title="مكافآتي"
    >
      <Coins className="w-4 h-4 text-yellow-600" />
      <span>{data.coins.toLocaleString('ar')}</span>
      {data.current_streak > 0 && (
        <>
          <span className="text-amber-300">•</span>
          <Flame className="w-4 h-4 text-orange-500" />
          <span>{data.current_streak}</span>
        </>
      )}
      {data.can_claim_daily && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </Link>
  );
};

export default RewardsHeaderBadge;
