import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Coins, Check, Palette, Frame, Award, MessageSquare, ImageIcon, Lock, Search } from 'lucide-react';
import {
  useGamificationState,
  useShopItems,
  usePurchaseShopItem,
  useSelectCosmetic,
  useClearCosmetic,
} from '@/hooks/useGamification';
import type { ShopCategory } from '@/services/gamification';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const CATEGORY_META: Record<ShopCategory, { label: string; icon: React.ReactNode }> = {
  name_color: { label: 'ألوان الاسم', icon: <Palette className="w-4 h-4" /> },
  avatar_frame: { label: 'إطارات الصورة', icon: <Frame className="w-4 h-4" /> },
  badge: { label: 'الشارات', icon: <Award className="w-4 h-4" /> },
  comment_highlight: { label: 'تمييز التعليقات', icon: <MessageSquare className="w-4 h-4" /> },
  profile_background: { label: 'خلفيات الملف', icon: <ImageIcon className="w-4 h-4" /> },
};

const Shop: React.FC = () => {
  const { user } = useAuth();
  const { data: state } = useGamificationState();
  const { data: items, isLoading } = useShopItems();
  const purchase = usePurchaseShopItem();
  const selectCosmetic = useSelectCosmetic();
  const clearCosmetic = useClearCosmetic();
  const [activeCat, setActiveCat] = useState<ShopCategory>('name_color');
  const [query, setQuery] = useState('');

  const ownedIds = useMemo(() => new Set(state?.purchases.map((p) => p.item_id) ?? []), [state]);

  const grouped = useMemo(() => {
    const map = new Map<ShopCategory, NonNullable<typeof items>>();
    (items ?? []).forEach((it) => {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    });
    return map;
  }, [items]);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center font-sans" dir="rtl">
        <h1 className="text-2xl font-bold mb-4 text-foreground">سجّل الدخول لزيارة المتجر</h1>
        <Link to="/auth"><Button>تسجيل الدخول</Button></Link>
      </div>
    );
  }

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>;

  const categories = Array.from(grouped.keys());
  const userCoins = state?.coins ?? 0;

  const currentItems = (grouped.get(activeCat) ?? []).filter((it) =>
    query.trim() === '' ? true : it.title_ar.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-10 font-sans" dir="rtl">
      <Helmet><title>المتجر — كتبي</title></Helmet>

      <div className="container mx-auto px-4 pt-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              المتجر
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              خصّص ملفك الشخصي بعناصر تجميلية
            </p>
          </div>

          <div className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2 shadow-sm">
            <Coins className="w-4 h-4 text-primary" />
            <span className="font-bold text-foreground" dir="ltr">
              {userCoins.toLocaleString('en')}
            </span>
            <span className="text-xs text-muted-foreground">عملة</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المتجر…"
            className="pr-10 bg-card border-border rounded-full h-11 font-sans"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-6 -mx-4 px-4 scrollbar-hide">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat];
            const active = activeCat === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all border ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {meta.icon}
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {currentItems.map((item) => {
            const owned = ownedIds.has(item.id);
            const selected =
              (item.category === 'name_color' && state?.selected_name_color === item.preview_value) ||
              (item.category === 'avatar_frame' && state?.selected_avatar_frame === item.preview_value) ||
              (item.category === 'profile_background' && state?.selected_profile_background === item.preview_value) ||
              (item.category === 'badge' && state?.selected_badge === item.preview_value) ||
              (item.category === 'comment_highlight' && state?.selected_comment_highlight === item.preview_value);
            const canAfford = userCoins >= item.price_coins;

            return (
              <Card
                key={item.id}
                className={`group relative overflow-hidden flex flex-col bg-card border transition-all hover:shadow-md ${
                  selected
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                {selected && (
                  <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> مُطبّق
                  </div>
                )}
                {owned && !selected && (
                  <div className="absolute top-2 right-2 z-10 bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                    مملوك
                  </div>
                )}

                <PreviewBlock item={item} />

                <div className="p-3 flex flex-col flex-1 gap-2">
                  <h3 className="font-semibold text-sm text-foreground line-clamp-1">
                    {item.title_ar}
                  </h3>

                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-sm font-bold text-foreground" dir="ltr">
                      <Coins className="w-3.5 h-3.5 text-primary" />
                      {item.price_coins.toLocaleString('en')}
                    </span>

                    {owned ? (
                      selected ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => clearCosmetic.mutate(item.category)}
                        >
                          إزالة
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => selectCosmetic.mutate(item.id)}
                        >
                          تطبيق
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        disabled={purchase.isPending || !canAfford}
                        onClick={() => purchase.mutate(item.id)}
                        className="h-8 text-xs"
                        variant={canAfford ? 'default' : 'outline'}
                      >
                        {canAfford ? 'شراء' : <><Lock className="w-3 h-3 ml-1" /> ناقص</>}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {currentItems.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            لا توجد عناصر مطابقة
          </div>
        )}
      </div>
    </div>
  );
};

const PreviewBlock: React.FC<{ item: { category: ShopCategory; preview_value: string | null; title_ar: string } }> = ({ item }) => {
  if (item.category === 'name_color') {
    return (
      <div className="h-28 bg-muted/40 border-b border-border flex items-center justify-center">
        <span className="text-3xl font-extrabold" style={{ color: item.preview_value ?? undefined }}>
          كتبي
        </span>
      </div>
    );
  }
  if (item.category === 'avatar_frame') {
    const frameClass: Record<string, string> = {
      gold: 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-background',
      neon: 'ring-4 ring-cyan-400 ring-offset-2 ring-offset-background shadow-[0_0_20px_rgba(34,211,238,0.7)]',
      fire: 'ring-4 ring-orange-500 ring-offset-2 ring-offset-background shadow-[0_0_20px_rgba(249,115,22,0.8)]',
    };
    return (
      <div className="h-28 bg-muted/40 border-b border-border flex items-center justify-center">
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-muted to-accent ${frameClass[item.preview_value ?? ''] ?? 'ring-2 ring-border'}`} />
      </div>
    );
  }
  if (item.category === 'badge') {
    return (
      <div className="h-28 bg-muted/40 border-b border-border flex items-center justify-center text-5xl">
        {item.preview_value}
      </div>
    );
  }
  if (item.category === 'comment_highlight') {
    return (
      <div className="h-28 flex items-center justify-center p-3 border-b border-border" style={{ background: item.preview_value ?? 'linear-gradient(135deg,#fde68a,#fca5a5)' }}>
        <span className="text-xs bg-background/90 px-2 py-1 rounded-md font-medium text-foreground">تعليق مميّز</span>
      </div>
    );
  }
  return (
    <div
      className="h-28 border-b border-border"
      style={{
        background: item.preview_value ?? 'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--accent)))',
      }}
    />
  );
};

export default Shop;
