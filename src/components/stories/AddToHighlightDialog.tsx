import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Star } from 'lucide-react';
import { useStoryHighlights } from '@/hooks/useStoryHighlights';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  story: {
    id: string;
    media_url: string;
    media_type: string;
    caption: string | null;
    duration: number;
    book_id: string | null;
    book_slug: string | null;
    created_at: string;
  };
}

const AddToHighlightDialog: React.FC<Props> = ({ open, onOpenChange, story }) => {
  const { highlights, createHighlightWithStory, addStoryToHighlight } = useStoryHighlights();
  const [saving, setSaving] = useState(false);

  const handleCreateNew = async () => {
    setSaving(true);
    const defaultTitle = `مميزة ${highlights.length + 1}`;
    const id = await createHighlightWithStory({ title: defaultTitle, story });
    setSaving(false);
    if (id) {
      toast.success('تم إنشاء Highlight جديد');
      onOpenChange(false);
    }
  };

  const handleAdd = async (highlightId: string) => {
    setSaving(true);
    const ok = await addStoryToHighlight(highlightId, story);
    setSaving(false);
    if (ok) {
      toast.success('تمت الإضافة');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" /> حفظ في Highlights
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {highlights.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">اختر Highlight لإضافة الستوري إليه:</p>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {highlights.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => handleAdd(h.id)}
                    disabled={saving}
                    className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-accent transition disabled:opacity-50 text-right"
                  >
                    {h.cover_url ? (
                      <img src={h.cover_url} alt={h.title} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Star className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{h.title}</p>
                      <p className="text-xs text-muted-foreground">{h.items_count ?? 0} قصة</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleCreateNew} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Plus className="w-4 h-4 ml-2" />}
            إنشاء Highlight جديد
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddToHighlightDialog;
