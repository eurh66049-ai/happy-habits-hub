import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, PlayCircle, Cloud, HardDrive } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';

interface Counts {
  total: number;
  migrated: number;
  remaining: number;
  totalBytesRemaining: number;
}

export default function S3MigrationStatus() {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchCounts = useCallback(async () => {
    try {
      const [totalRes, remainingRes, migratedRes, sizeRes] = await Promise.all([
        supabase.from('approved_books').select('id', { count: 'exact', head: true }),
        supabase.from('approved_books').select('id', { count: 'exact', head: true }).is('s3_book_file_url', null),
        supabase.from('approved_books').select('id', { count: 'exact', head: true }).not('s3_book_file_url', 'is', null),
        supabase.from('approved_books').select('file_size').is('s3_book_file_url', null).limit(20000),
      ]);

      const totalBytesRemaining = (sizeRes.data || []).reduce(
        (sum: number, r: { file_size: number | null }) => sum + (r.file_size || 0),
        0,
      );

      setCounts({
        total: totalRes.count ?? 0,
        migrated: migratedRes.count ?? 0,
        remaining: remainingRes.count ?? 0,
        totalBytesRemaining,
      });
    } catch (e) {
      console.error('fetchCounts error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const runBatchNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-books-to-s3', {
        body: { batch_size: 100 },
      });
      if (error) throw error;
      toast({
        title: 'بدأت الدفعة في الخلفية',
        description: `يتم نقل ${data?.batch_size ?? 100} كتاب الآن. سيُحدَّث العدّاد تلقائياً.`,
      });
      await fetchCounts();
    } catch (e) {
      toast({
        title: 'فشل تشغيل الدفعة',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  };

  if (loading || !counts) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const knownTotal = counts.migrated + counts.remaining;
  const percent = knownTotal > 0 ? Math.round((counts.migrated / knownTotal) * 100) : 0;
  const etaMinutes = Math.ceil(counts.remaining / 8); // 8/min cron

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            تقدّم نقل الكتب إلى S3
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchCounts} disabled={loading}>
              <RefreshCw className="ml-1 h-4 w-4" />
              تحديث
            </Button>
            <Button size="sm" onClick={runBatchNow} disabled={running}>
              {running ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="ml-1 h-4 w-4" />
              )}
              تشغيل دفعة الآن (100)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-semibold">{percent}% منجَز</span>
              <span className="text-muted-foreground">
                {counts.migrated.toLocaleString()} / {knownTotal.toLocaleString()}
              </span>
            </div>
            <Progress value={percent} className="h-3" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Cloud className="h-4 w-4" />
                منقولة إلى S3
              </div>
              <div className="text-2xl font-bold text-green-600">
                {counts.migrated.toLocaleString()}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <HardDrive className="h-4 w-4" />
                باقية على Supabase
              </div>
              <div className="text-2xl font-bold text-orange-600">
                {counts.remaining.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                ≈ {formatBytes(counts.totalBytesRemaining)}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <RefreshCw className="h-4 w-4" />
                الوقت المقدّر للاكتمال
              </div>
              <div className="text-2xl font-bold">
                {etaMinutes >= 60
                  ? `${Math.floor(etaMinutes / 60)}س ${etaMinutes % 60}د`
                  : `${etaMinutes}د`}
              </div>
              <div className="text-xs text-muted-foreground mt-1">بمعدّل 8 كتب/دقيقة</div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground border-t pt-3">
            يعمل cron تلقائياً كل دقيقة. لا يُحذف أي ملف من Supabase Storage — فقط يُحدَّث رابط الكتاب في قاعدة البيانات.
            يُحدَّث هذا العدّاد كل 10 ثوانٍ.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
