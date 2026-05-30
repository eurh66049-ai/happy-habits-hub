import React, { useCallback, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

interface Props {
  children: React.ReactNode;
  isOwn: boolean;
  canDelete: boolean;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}

export const MessageBubbleActions: React.FC<Props> = ({
  children,
  isOwn,
  canDelete,
  onReact,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const clearTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startPress = useCallback(() => {
    triggeredRef.current = false;
    clearTimer();
    longPressTimer.current = window.setTimeout(() => {
      triggeredRef.current = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate?.(20); } catch {}
      }
      setOpen(true);
    }, 450);
  }, []);

  const cancelPress = useCallback(() => {
    clearTimer();
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    triggeredRef.current = true;
    setOpen(true);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onTouchMove={cancelPress}
          onTouchCancel={cancelPress}
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onContextMenu={onContextMenu}
          className="select-none w-full"
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={12}
        className="p-1.5 w-auto rounded-full border-border/60 bg-card/95 backdrop-blur shadow-lg"
      >
        <div className="flex items-center gap-0.5">
          {QUICK_REACTIONS.map((emoji, i) => (
            <motion.button
              key={emoji}
              initial={{ opacity: 0, scale: 0.5, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: i * 0.025, type: 'spring', stiffness: 400, damping: 22 }}
              whileHover={{ scale: 1.25 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => { onReact(emoji); setOpen(false); }}
              className="h-9 w-9 rounded-full flex items-center justify-center text-lg hover:bg-muted/60 transition-colors"
              aria-label={`تفاعل بـ ${emoji}`}
            >
              {emoji}
            </motion.button>
          ))}
          {canDelete && (
            <>
              <div className="w-px h-6 bg-border/60 mx-1" />
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: QUICK_REACTIONS.length * 0.025 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => { onDelete(); setOpen(false); }}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center",
                  "text-destructive hover:bg-destructive/10 transition-colors"
                )}
                aria-label="حذف الرسالة"
                title="حذف الرسالة"
              >
                <Trash2 className="h-4 w-4" />
              </motion.button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MessageBubbleActions;
