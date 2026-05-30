import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useQuoteLikes } from '@/hooks/useQuoteLikes';
import { toast } from 'sonner';

interface QuoteLikeButtonProps {
  quoteId: string;
}

export const QuoteLikeButton: React.FC<QuoteLikeButtonProps> = ({ quoteId }) => {
  const { user } = useAuth();
  const { likesCount, isLiked, toggleLike } = useQuoteLikes(quoteId);
  const [burst, setBurst] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const handleLikeClick = useCallback(async () => {
    if (!user) {
      toast.error('يجب تسجيل الدخول للإعجاب بالاقتباس');
      return;
    }
    try {
      if (!isLiked) {
        setBurst(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setBurst(false), 600);
      }
      await toggleLike();
    } catch {
      toast.error('حدث خطأ أثناء الإعجاب بالاقتباس');
    }
  }, [user, isLiked, toggleLike]);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLikeClick}
        className={`relative flex items-center gap-2 rounded-full px-4 overflow-visible ${
          isLiked
            ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20'
            : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10'
        }`}
      >
        <div className="relative">
          <Heart
            className={`h-5 w-5 ${isLiked ? 'fill-current' : ''} ${burst ? 'animate-heart-pop' : ''}`}
            style={{ willChange: burst ? 'transform' : 'auto' }}
          />
          {burst && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-red-400 animate-heart-ring pointer-events-none"
            />
          )}
        </div>
        <span className="font-medium tabular-nums">{likesCount}</span>
      </Button>
    </div>
  );
};
