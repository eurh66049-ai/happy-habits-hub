import React, { useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { useStoryHighlights } from '@/hooks/useStoryHighlights';
import { useAuth } from '@/context/AuthContext';
import HighlightViewer from './HighlightViewer';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  userId: string;
}

const HighlightsBar: React.FC<Props> = ({ userId }) => {
  const { user } = useAuth();
  const { highlights, loading, deleteHighlight } = useStoryHighlights(userId);
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const isOwner = user?.id === userId;

  if (loading) {
    return (
      <div className="flex gap-3 px-4 py-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-16 h-16 rounded-full" />
        ))}
      </div>
    );
  }

  if (highlights.length === 0 && !isOwner) return null;

  return (
    <>
      <div className="px-2 py-3" dir="rtl">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-2 flex items-center gap-1.5">
          <Star className="w-4 h-4" />
          Highlights
        </h3>
        <ScrollArea className="w-full">
          <div className="flex gap-3 px-2 pb-2">
            {highlights.map((h) => (
              <div key={h.id} className="flex flex-col items-center gap-1 shrink-0 group relative">
                <button
                  onClick={() => setSelected({ id: h.id, title: h.title })}
                  className="relative"
                >
                  <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-primary">
                    <div className="w-full h-full rounded-full bg-background p-[2px]">
                      {h.cover_url ? (
                        <img src={h.cover_url} alt={h.title} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                          <Star className="w-6 h-6 text-primary" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                <span className="text-xs text-foreground max-w-[64px] truncate">{h.title}</span>
                {isOwner && (
                  <button
                    onClick={() => {
                      if (confirm(`حذف Highlight "${h.title}"؟`)) deleteHighlight(h.id);
                    }}
                    className="absolute -top-1 -right-1 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      {selected && (
        <HighlightViewer
          highlightId={selected.id}
          title={selected.title}
          ownerId={userId}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
};

export default HighlightsBar;
