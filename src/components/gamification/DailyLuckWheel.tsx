import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { gamification, type WheelSpinResult } from '@/services/gamification';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

const SEGMENTS: Array<{ label: string; emoji: string; color: string }> = [
  { label: '10 🪙', emoji: '💰', color: '#fbbf24' },
  { label: '50 🪙', emoji: '💎', color: '#f59e0b' },
  { label: '100 🪙', emoji: '🏆', color: '#ef4444' },
  { label: '200 🪙', emoji: '👑', color: '#8b5cf6' },
  { label: 'كتاب مميز', emoji: '📚', color: '#10b981' },
  { label: 'مضاعف الحظ', emoji: '✨', color: '#3b82f6' },
];

function indexFromKind(kind: string | undefined): number {
  switch (kind) {
    case 'coins_small': return 0;
    case 'coins_medium': return 1;
    case 'coins_large': return 2;
    case 'coins_jackpot': return 3;
    case 'featured_book': return 4;
    case 'multiplier': return 5;
    default: return 0;
  }
}

const DailyLuckWheel: React.FC = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<WheelSpinResult | null>(null);
  const [alreadySpun, setAlreadySpun] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('user_gamification')
        .select('last_wheel_spin_date')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const today = new Date().toISOString().slice(0, 10);
      setAlreadySpun(data?.last_wheel_spin_date === today);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleSpin = async () => {
    if (spinning || alreadySpun) return;
    setSpinning(true);
    setResult(null);
    try {
      const res = await gamification.spinDailyWheel();
      if (!res.spun) {
        if (res.reason === 'already_spun_today') {
          toast.info('لقد دُرت العجلة اليوم! عُد غداً 🌙');
        } else {
          toast.error('تعذّر تدوير العجلة');
        }
        setSpinning(false);
        return;
      }
      const idx = indexFromKind(res.prize_kind);
      const segAngle = 360 / SEGMENTS.length;
      // 6 دورات كاملة + موضع الجائزة (في منتصف القطعة)
      const finalRotation = 360 * 6 + (360 - (idx * segAngle + segAngle / 2));
      setRotation((prev) => prev + finalRotation);
      setTimeout(() => {
        setResult(res);
        setSpinning(false);
        setAlreadySpun(true);
        toast.success(`🎉 ${res.prize_label}`);
        qc.invalidateQueries({ queryKey: ['gamification', 'state'] });
      }, 4200);
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء التدوير');
      setSpinning(false);
    }
  };

  return (
    <Card className="p-5 mb-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border-purple-200/50">
      <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
        <Sparkles className="text-purple-500" /> 🎲 عجلة الحظ اليومية
      </h2>
      <p className="text-sm text-muted-foreground mb-4">دوّر العجلة مرة واحدة كل يوم واحصل على جائزة!</p>

      <div className="flex flex-col items-center">
        <div className="relative w-64 h-64">
          {/* المؤشر */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-red-600 drop-shadow-md" />
          {/* العجلة */}
          <div
            className="w-64 h-64 rounded-full border-4 border-amber-500 shadow-2xl overflow-hidden relative"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.21, 1)' : 'none',
              background: `conic-gradient(${SEGMENTS.map((s, i) => `${s.color} ${(i * 360) / SEGMENTS.length}deg ${((i + 1) * 360) / SEGMENTS.length}deg`).join(', ')})`,
            }}
          >
            {SEGMENTS.map((s, i) => {
              const angle = (i * 360) / SEGMENTS.length + 360 / SEGMENTS.length / 2;
              return (
                <div
                  key={i}
                  className="absolute top-1/2 left-1/2 text-white font-bold text-xs text-center pointer-events-none"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-70px) rotate(${-angle}deg)`,
                    width: '70px',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.6)',
                  }}
                >
                  <div className="text-2xl">{s.emoji}</div>
                  <div className="mt-1">{s.label}</div>
                </div>
              );
            })}
          </div>
          {/* مركز */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-amber-500 border-4 border-white shadow-lg" />
        </div>

        <Button
          size="lg"
          className="mt-6 w-full max-w-xs bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold"
          onClick={handleSpin}
          disabled={spinning || alreadySpun}
        >
          {spinning ? 'يتم التدوير...' : alreadySpun ? '✅ تم التدوير اليوم - عُد غداً' : '🎲 دوّر العجلة الآن'}
        </Button>

        {result?.spun && (
          <div className="mt-4 p-3 rounded-lg bg-white/70 dark:bg-black/30 text-center w-full">
            <div className="text-lg font-bold">🎉 ربحت: {result.prize_label}</div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default DailyLuckWheel;