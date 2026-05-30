import React from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useBookLikes } from '@/hooks/useBookLikes';
import { useBookDislikes } from '@/hooks/useBookDislikes';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';

interface BookLikeDislikeButtonsProps {
  bookId: string;
  size?: 'sm' | 'lg';
  showCount?: boolean;
  className?: string;
  likeClassName?: string;
  dislikeClassName?: string;
  layout?: 'row' | 'column';
}

export const BookLikeDislikeButtons: React.FC<BookLikeDislikeButtonsProps> = ({
  bookId,
  size = 'sm',
  showCount = true,
  className = '',
  likeClassName = '',
  dislikeClassName = '',
  layout = 'row',
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { likesCount, isLiked, loading: likeLoading, toggleLike, removeLikeLocally } = useBookLikes(bookId);
  const { dislikesCount, isDisliked, loading: dislikeLoading, toggleDislike, removeDislikeLocally } = useBookDislikes(bookId);

  const requireAuth = () => {
    const redirectPath = location.pathname + location.search;
    localStorage.setItem('auth_redirect_path', redirectPath);
    navigate('/auth');
  };

  const handleLike = async () => {
    if (!user) {
      toast.error('يجب تسجيل الدخول لإضافة الإعجاب');
      requireAuth();
      return;
    }
    if (isDisliked) removeDislikeLocally();
    try {
      await toggleLike();
    } catch (e) {
      console.error('خطأ في تبديل الإعجاب:', e);
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };

  const handleDislike = async () => {
    if (!user) {
      toast.error('يجب تسجيل الدخول لإضافة عدم الإعجاب');
      requireAuth();
      return;
    }
    if (isLiked) removeLikeLocally();
    try {
      await toggleDislike();
    } catch (e) {
      console.error('خطأ في تبديل عدم الإعجاب:', e);
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };



  const buttonSizeClasses = {
    sm: 'h-8 px-3 text-sm',
    lg: 'h-12 px-6 text-lg',
  };
  const iconSizeClasses = {
    sm: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const containerClass = layout === 'row' ? 'flex items-center gap-2' : 'flex flex-col gap-2';

  return (
    <div className={`${containerClass} ${className}`}>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={handleLike}
        disabled={likeLoading || dislikeLoading}
        className={`${buttonSizeClasses[size]} ${likeClassName} active:scale-95 transition-transform ${
          isLiked
            ? 'text-green-500 border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700'
            : ''
        }`}
      >
        <ThumbsUp
          className={`${iconSizeClasses[size]} ${showCount ? 'ml-2' : ''} ${
            isLiked ? 'fill-current text-green-500' : ''
          }`}
        />
        {showCount && (
          <span className={`font-medium ${isLiked ? 'text-green-500' : ''}`}>
            {likesCount}
          </span>
        )}
      </Button>

      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={handleDislike}
        disabled={likeLoading || dislikeLoading}
        className={`${buttonSizeClasses[size]} ${dislikeClassName} active:scale-95 transition-transform ${
          isDisliked
            ? 'text-red-500 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700'
            : ''
        }`}
      >
        <ThumbsDown
          className={`${iconSizeClasses[size]} ${showCount ? 'ml-2' : ''} ${
            isDisliked ? 'fill-current text-red-500' : ''
          }`}
        />
        {showCount && (
          <span className={`font-medium ${isDisliked ? 'text-red-500' : ''}`}>
            {dislikesCount}
          </span>
        )}
      </Button>
    </div>
  );
};
