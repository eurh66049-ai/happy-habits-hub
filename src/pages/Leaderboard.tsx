import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Trophy, Flame, Crown, Medal } from 'lucide-react';
import { useLeaderboard } from '@/hooks/useGamification';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

type Period = 'week' | 'month' | 'alltime';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'alltime', label: 'كل الأوقات' },
];

const Leaderboard: React.FC = () => {
  const [period, setPeriod] = useState<Period>('week');
  const { data, isLoading } = useLeaderboard(period);

  return (
    <div className="container mx-auto px-4 py-6 pb-32 md:pb-6 max-w-3xl" dir="rtl">
      <Helmet><title>لوحة المتصدرين — كتبي</title></Helmet>

      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <Trophy className="text-amber-500" /> لوحة المتصدرين
      </h1>

      <div className="flex gap-2 mb-6">
        {PERIODS.map((p) => (
          <Button
            key={p.value}
            variant={period === p.value ? 'default' : 'outline'}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : (data?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          لا توجد بيانات بعد لهذه الفترة. كن أول من يحصد النقاط!
        </Card>
      ) : (
        <Card className="p-4">
          <div className="space-y-2">
            {data?.map((entry, idx) => {
              const rank = idx + 1;
              return (
                <Link
                  key={entry.user_id}
                  to={`/user/${entry.username ?? entry.user_id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition"
                >
                  <RankBadge rank={rank} />
                  <Avatar entry={entry} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-bold truncate"
                      style={{ color: entry.selected_name_color ?? undefined }}
                    >
                      {entry.username ?? 'قارئ'}
                    </div>
                    {entry.current_streak && entry.current_streak > 0 && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Flame className="w-3 h-3 text-orange-500" /> {entry.current_streak} يوم
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-base">{Number(entry.total_xp).toLocaleString('ar')} XP</Badge>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank === 1) return <Crown className="w-7 h-7 text-amber-500" />;
  if (rank === 2) return <Medal className="w-7 h-7 text-gray-400" />;
  if (rank === 3) return <Medal className="w-7 h-7 text-amber-700" />;
  return <span className="w-7 text-center font-bold text-muted-foreground">{rank}</span>;
};

const Avatar: React.FC<{ entry: { avatar_url: string | null; username: string | null; selected_avatar_frame: string | null } }> = ({ entry }) => {
  const frameClass: Record<string, string> = {
    gold: 'ring-2 ring-yellow-400',
    neon: 'ring-2 ring-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]',
    fire: 'ring-2 ring-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.7)]',
  };
  const cls = frameClass[entry.selected_avatar_frame ?? ''] ?? '';
  return entry.avatar_url ? (
    <img src={entry.avatar_url} alt="" className={`w-10 h-10 rounded-full object-cover ${cls}`} />
  ) : (
    <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-bold ${cls}`}>
      {(entry.username ?? '?')[0]}
    </div>
  );
};

export default Leaderboard;
