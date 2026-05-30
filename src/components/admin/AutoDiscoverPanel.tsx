import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Infinity as InfinityIcon, Play, Loader2, RefreshCw } from 'lucide-react';

interface Config {
  enabled: boolean;
  search_query: string;
  cursor: string | null;
  batch_size: number;
  min_pending_threshold: number;
  total_discovered: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  current_query_index: number | null;
}

const AutoDiscoverPanel: React.FC = () => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('auto_discover_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      setCfg(data as unknown as Config);
    }
    const { count } = await supabase
      .from('bulk_upload_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']);
    setPendingCount(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const save = async (patch: Partial<Config>) => {
    setSaving(true);
    const { error } = await supabase
      .from('auto_discover_config')
      .update(patch)
      .eq('id', 1);
    setSaving(false);
    if (error) {
      toast({ title: 'فشل الحفظ', description: error.message, variant: 'destructive' });
    } else {
      await load();
    }
  };

  const toggleEnabled = async (checked: boolean) => {
    await save({
      enabled: checked,
      cursor: checked ? null : cfg?.cursor,
    } as Partial<Config>);
    toast({
      title: checked ? '✅ تم تشغيل الاكتشاف التلقائي' : '⏸️ تم إيقاف الاكتشاف التلقائي',
      description: checked
        ? 'سيستمر النظام في جلب الكتب بلا توقف ويتنقّل تلقائياً بين كلمات البحث عند انتهاء كل واحدة.'
        : 'لن يتم جلب كتب جديدة. الكتب الموجودة في الطابور ستستمر في الرفع.',
    });
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-discover-archive-worker', {
        body: {},
      });
      if (error) throw new Error(error.message);
      toast({
        title: 'اكتمل التشغيل اليدوي',
        description: data?.skipped
          ? `تم التخطي (${data?.reason || 'الطابور ممتلئ'})`
          : `أُضيف ${data?.inserted || 0} كتاب من ${data?.scanned || 0} نتيجة`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل التشغيل', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const resetCursor = async () => {
    await save({ cursor: null } as Partial<Config>);
    toast({ title: 'تمت إعادة تعيين المؤشر', description: 'سيبدأ الاكتشاف من بداية النتائج في الدورة القادمة.' });
  };

  if (loading && !cfg) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <InfinityIcon className="h-5 w-5 text-primary" />
          الاكتشاف والرفع التلقائي المستمر (بلا توقف)
          {cfg?.enabled && (
            <Badge variant="default" className="mr-auto bg-green-600">نشط</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription className="space-y-1">
            <div>
              عند التفعيل، سيقوم النظام تلقائياً بـ:
            </div>
            <ul className="list-disc pr-5 text-sm space-y-0.5">
              <li>جلب الكتب من Archive.org <strong>بلا توقف</strong> كل دقيقة — لا ينتظر فراغ الطابور.</li>
              <li>التنقّل التلقائي بين كلمات البحث: عند انتهاء كتب كلمة (مثلاً <em>روايات</em>) ينتقل للكلمة التالية تلقائياً.</li>
              <li>إضافتها مباشرة إلى طابور الرفع، ويتولّى المعالج رفعها كل دقيقة.</li>
              <li>التشغيل مستمر <strong>على الخادم</strong> حتى وأنت خارج الموقع.</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
          <div className="space-y-1">
            <Label className="text-base font-bold">تشغيل الاكتشاف التلقائي</Label>
            <div className="text-xs text-muted-foreground">
              {cfg?.enabled ? 'النظام يعمل الآن في الخلفية' : 'متوقف'}
            </div>
          </div>
          <Switch
            checked={!!cfg?.enabled}
            onCheckedChange={toggleEnabled}
            disabled={saving}
          />
        </div>

        <div className="rounded-lg border p-3 bg-background space-y-2">
          <Label className="text-sm font-bold">وضع الاكتشاف الذكي</Label>
          <div className="text-sm text-muted-foreground leading-6">
            لا يحتاج النظام الآن إلى قائمة كلمات. Mistral AI يولّد عناوين حقيقية تلقائياً، ثم يبحث في بوابات Archive.org الواسعة ويتجنب الروابط والعناوين المكررة قبل إضافتها للطابور.
          </div>
          <Badge variant="secondary" className="text-xs">
            الجولة الحالية: {((cfg?.current_query_index ?? 0) % 30) + 1}/30 موضوع تلقائي
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">في الطابور الآن</div>
            <div className="text-xl font-bold tabular-nums">{pendingCount}</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">إجمالي مكتشَف</div>
            <div className="text-xl font-bold tabular-nums">{cfg?.total_discovered || 0}</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">دفعة الجلب</div>
            <div className="text-xl font-bold tabular-nums">100</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">آخر تشغيل</div>
            <div className="text-xs font-bold">
              {cfg?.last_run_at ? new Date(cfg.last_run_at).toLocaleTimeString('ar') : '—'}
            </div>
          </div>
        </div>

        {cfg?.last_status && (
          <div className="text-xs text-muted-foreground rounded border bg-muted/30 p-2">
            <strong>آخر حالة:</strong> {cfg.last_status}
          </div>
        )}
        {cfg?.last_error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{cfg.last_error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={runNow} disabled={running} variant="default">
            {running ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
            تشغيل الآن (يدوي)
          </Button>
          <Button onClick={resetCursor} variant="outline" disabled={saving}>
            <RefreshCw className="ml-2 h-4 w-4" />
            إعادة تعيين المؤشر
          </Button>
          <Button onClick={load} variant="ghost" size="sm">
            تحديث
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutoDiscoverPanel;
