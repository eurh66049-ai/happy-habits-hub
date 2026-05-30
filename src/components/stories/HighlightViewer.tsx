import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, BookOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStoryHighlights, StoryHighlightItem } from '@/hooks/useStoryHighlights';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Props {
  highlightId: string;
  title: string;
  ownerId: string;
  onClose: () => void;
}

const HighlightViewer: React.FC<Props> = ({ highlightId, title, ownerId, onClose }) => {
  const { user } = useAuth();
  const { getHighlightItems } = useStoryHighlights();
  const navigate = useNavigate();
  const [items, setItems] = useState<StoryHighlightItem[]>([]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isOwner = user?.id === ownerId;

  useEffect(() => {
    getHighlightItems(highlightId).then((data) => {
      setItems(data);
    });
  }, [highlightId, getHighlightItems]);

  const current = items[index];
  const duration = (current?.duration || 5) * 1000;

  const next = useCallback(() => {
    setProgress(0);
    if (index < items.length - 1) setIndex(index + 1);
    else onClose();
  }, [index, items.length, onClose]);

  useEffect(() => {
    if (!current) return;
    setProgress(0);
    const step = 50;
    const inc = (step / duration) * 100;
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          next();
          return 0;
        }
        return p + inc;
      });
    }, step);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [current, duration, next]);

  const handleDeleteItem = async () => {
    if (!current) return;
    if (!confirm('حذف هذه القصة من Highlight؟')) return;
    const { error } = await supabase.from('story_highlight_items').delete().eq('id', current.id);
    if (error) {
      toast.error('تعذر الحذف');
      return;
    }
    toast.success('تم الحذف');
    const newItems = items.filter((i) => i.id !== current.id);
    setItems(newItems);
    if (newItems.length === 0) onClose();
    else if (index >= newItems.length) setIndex(newItems.length - 1);
  };

  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
        onClick={onClose}
      >
        <div className="relative w-full h-full max-w-md mx-auto" onClick={(e) => e.stopPropagation()}>
          {/* Progress bars */}
          <div className="absolute top-2 left-2 right-2 z-30 flex gap-1">
            {items.map((_, i) => (
              <div key={i} className="flex-1 h-1 bg-white/30 rounded overflow-hidden">
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: `${i < index ? 100 : i === index ? progress : 0}%` }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="absolute top-6 left-2 right-2 z-30 flex items-center justify-between text-white">
            <span className="font-bold">{title}</span>
            <button onClick={onClose} className="p-2 rounded-full bg-white/20 backdrop-blur-sm">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Media */}
          <div className="w-full h-full flex items-center justify-center">
            {current.media_type === 'video' ? (
              <video src={current.media_url} className="max-w-full max-h-full" autoPlay playsInline muted />
            ) : (
              <img src={current.media_url} alt="" className="max-w-full max-h-full object-contain" />
            )}
          </div>

          {current.caption && (
            <div className="absolute bottom-24 left-4 right-4 text-white text-center font-medium drop-shadow-lg z-20">
              {current.caption}
            </div>
          )}

          {/* Book link */}
          {current.book_slug && (
            <Button
              variant="ghost"
              className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 rounded-full"
              onClick={() => {
                onClose();
                navigate(`/book/${current.book_slug}`);
              }}
            >
              <BookOpen className="w-4 h-4 ml-2" />
              فتح الكتاب
            </Button>
          )}

          {/* Owner delete */}
          {isOwner && (
            <button
              onClick={handleDeleteItem}
              className="absolute bottom-2 right-4 z-20 p-2 rounded-full bg-red-500/30 text-white backdrop-blur-sm"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}

          {/* Nav */}
          <div className="absolute inset-y-0 left-0 w-1/3 z-10" onClick={() => { if (index > 0) { setIndex(index - 1); setProgress(0); } }} />
          <div className="absolute inset-y-0 right-0 w-1/3 z-10" onClick={next} />

          {index > 0 && (
            <button className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/20 rounded-full text-white" onClick={() => { setIndex(index - 1); setProgress(0); }}>
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          {index < items.length - 1 && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/20 rounded-full text-white" onClick={next}>
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default HighlightViewer;
