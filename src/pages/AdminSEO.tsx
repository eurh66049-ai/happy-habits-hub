import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Search, Globe, Link2, FileText, Sparkles, RefreshCw, ArrowLeft,
  TrendingUp, Gauge,
} from 'lucide-react';

const DEFAULT_DOMAIN = 'kotobi.xyz';
const DEFAULT_DATABASE = 'us';

interface SemrushResponse {
  data?: { columnNames?: string[]; rows?: any[][] };
  status?: number;
  error?: string;
  details?: any;
}

const callSemrush = async (
  path: string,
  query: Record<string, string | number | undefined>,
): Promise<SemrushResponse> => {
  const { data, error } = await supabase.functions.invoke('semrush-proxy', {
    body: { path, query },
  });
  if (error) {
    throw new Error(error.message || 'Semrush request failed');
  }
  return data as SemrushResponse;
};

const formatNumber = (v: string | number | undefined) => {
  if (v === undefined || v === null || v === '') return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString();
};

function ResultTable({
  loading,
  resp,
  emptyText = 'لا توجد بيانات حتى الآن. اضغط "تحديث" لجلب البيانات.',
}: {
  loading: boolean;
  resp: SemrushResponse | null;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner size="lg" color="red" />
      </div>
    );
  }
  if (!resp) return <p className="text-muted-foreground text-sm">{emptyText}</p>;
  if (resp.error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <p className="font-semibold">خطأ من Semrush</p>
        <pre className="mt-2 overflow-auto text-xs">
          {JSON.stringify(resp.details || resp.error, null, 2)}
        </pre>
      </div>
    );
  }
  const cols = resp.data?.columnNames || [];
  const rows = resp.data?.rows || [];
  if (!cols.length || !rows.length) {
    return <p className="text-muted-foreground text-sm">لا توجد نتائج لهذا الاستعلام.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((cell, j) => (
                <TableCell key={j} className="whitespace-nowrap text-sm">
                  {typeof cell === 'number' ? formatNumber(cell) : String(cell)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const AdminSEO: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckDone, setAdminCheckDone] = useState(false);

  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [database, setDatabase] = useState(DEFAULT_DATABASE);
  const [keyword, setKeyword] = useState('كتب');

  const [overview, setOverview] = useState<SemrushResponse | null>(null);
  const [topPages, setTopPages] = useState<SemrushResponse | null>(null);
  const [organic, setOrganic] = useState<SemrushResponse | null>(null);
  const [history, setHistory] = useState<SemrushResponse | null>(null);
  const [backlinks, setBacklinks] = useState<SemrushResponse | null>(null);
  const [refdomains, setRefdomains] = useState<SemrushResponse | null>(null);
  const [anchors, setAnchors] = useState<SemrushResponse | null>(null);
  const [keywordData, setKeywordData] = useState<SemrushResponse | null>(null);
  const [relatedKw, setRelatedKw] = useState<SemrushResponse | null>(null);
  const [questions, setQuestions] = useState<SemrushResponse | null>(null);
  const [limits, setLimits] = useState<SemrushResponse | null>(null);

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const setLoading = (k: string, v: boolean) =>
    setLoadingMap((m) => ({ ...m, [k]: v }));

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/'); return; }
    (async () => {
      if (!user.email) { navigate('/'); return; }
      const { data } = await supabase.rpc('is_admin_user', { user_email: user.email });
      if (data) {
        setIsAdmin(true);
      } else {
        toast.error('هذه الصفحة مخصصة للمسؤولين فقط');
        navigate('/');
      }
      setAdminCheckDone(true);
    })();
  }, [user, authLoading, navigate]);

  const runCall = async <K extends string>(
    key: K,
    setter: (r: SemrushResponse) => void,
    path: string,
    query: Record<string, string | number | undefined>,
  ) => {
    setLoading(key, true);
    try {
      const resp = await callSemrush(path, query);
      setter(resp);
      if (resp.error) toast.error('فشل جلب البيانات من Semrush');
    } catch (e: any) {
      setter({ error: e.message || 'request failed' });
      toast.error(e.message || 'فشل الاتصال بـ Semrush');
    } finally {
      setLoading(key, false);
    }
  };

  // ---- per-tab loaders ----
  const loadOverview = () => Promise.all([
    runCall('overview', setOverview, 'domains/domain_ranks', {
      domain, database, export_columns: 'Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
    }),
    runCall('history', setHistory, 'domains/domain_rank_history', {
      domain, database, export_columns: 'Rk,Or,Ot,Oc,Ad,At,Ac,Dt', display_limit: 12,
    }),
    runCall('organic', setOrganic, 'domains/domain_organic', {
      domain, database, export_columns: 'Ph,Po,Nq,Cp,Tr,Ur,Co,Kd', display_limit: 25,
    }),
  ]);

  const loadTopPages = () => runCall('topPages', setTopPages, 'domains/domain_organic_unique', {
    domain, database, export_columns: 'Ur,Pc,Tg,Tr', display_limit: 25,
  });

  const loadBacklinks = () => Promise.all([
    runCall('backlinks', setBacklinks, 'backlinks/backlinks_overview', {
      target: domain, target_type: 'root_domain',
    }),
    runCall('refdomains', setRefdomains, 'backlinks/backlinks_refdomains', {
      target: domain, target_type: 'root_domain', display_limit: 25,
    }),
    runCall('anchors', setAnchors, 'backlinks/backlinks_anchors', {
      target: domain, target_type: 'root_domain', display_limit: 25,
    }),
  ]);

  const loadKeyword = () => Promise.all([
    runCall('keyword', setKeywordData, 'keywords/phrase_this', {
      phrase: keyword, database, export_columns: 'Ph,Nq,Cp,Co,Nr,Td,Kd',
    }),
    runCall('related', setRelatedKw, 'keywords/phrase_related', {
      phrase: keyword, database, export_columns: 'Ph,Nq,Cp,Co,Kd', display_limit: 25,
    }),
    runCall('questions', setQuestions, 'keywords/phrase_questions', {
      phrase: keyword, database, export_columns: 'Ph,Nq,Cp,Co,Kd', display_limit: 25,
    }),
  ]);

  const loadLimits = () => runCall('limits', setLimits, 'user/limits', {});

  const overviewSummary = useMemo(() => {
    const row = overview?.data?.rows?.[0];
    const cols = overview?.data?.columnNames || [];
    if (!row) return null;
    const get = (name: string) => {
      const i = cols.indexOf(name);
      return i >= 0 ? row[i] : undefined;
    };
    return {
      organicKeywords: get('Organic Keywords'),
      organicTraffic: get('Organic Traffic'),
      organicCost: get('Organic Cost'),
      adwordsKeywords: get('Adwords Keywords'),
      adwordsTraffic: get('Adwords Traffic'),
      rank: get('Rank'),
    };
  }, [overview]);

  if (authLoading || !adminCheckDone) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" color="red" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Helmet>
        <title>تحليل SEO من Semrush — لوحة المسؤول</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              تحليل SEO عبر Semrush
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              أدوات احترافية لتحسين ترتيب موقعك في محركات البحث
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/admin/analytics')}>
            <ArrowLeft className="h-4 w-4 ml-2" /> عودة للوحة التحكم
          </Button>
        </div>

        {/* Global filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="domain">النطاق (Domain)</Label>
                <Input
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.trim())}
                  placeholder="example.com"
                />
              </div>
              <div>
                <Label htmlFor="database">قاعدة البيانات / السوق</Label>
                <Input
                  id="database"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value.trim().toLowerCase())}
                  placeholder="us, uk, sa, ae, eg…"
                />
              </div>
              <div>
                <Label htmlFor="keyword">كلمة مفتاحية للبحث</Label>
                <Input
                  id="keyword"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="مثلاً: كتب pdf"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Globe className="h-4 w-4 ml-1" />نظرة عامة</TabsTrigger>
            <TabsTrigger value="pages"><FileText className="h-4 w-4 ml-1" />أفضل الصفحات</TabsTrigger>
            <TabsTrigger value="backlinks"><Link2 className="h-4 w-4 ml-1" />الروابط الخلفية</TabsTrigger>
            <TabsTrigger value="keywords"><Search className="h-4 w-4 ml-1" />الكلمات المفتاحية</TabsTrigger>
            <TabsTrigger value="quota"><Gauge className="h-4 w-4 ml-1" />الحصة المتاحة</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="flex justify-end">
              <Button onClick={loadOverview} disabled={!!loadingMap.overview}>
                <RefreshCw className={`h-4 w-4 ml-2 ${loadingMap.overview ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>

            {overviewSummary && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="رتبة Semrush" value={overviewSummary.rank} />
                <StatCard label="كلمات عضوية" value={overviewSummary.organicKeywords} />
                <StatCard label="زيارات عضوية شهرياً" value={overviewSummary.organicTraffic} />
                <StatCard label="قيمة الترافيك ($)" value={overviewSummary.organicCost} />
                <StatCard label="كلمات إعلانية" value={overviewSummary.adwordsKeywords} />
                <StatCard label="زيارات إعلانية" value={overviewSummary.adwordsTraffic} />
              </div>
            )}

            <Card>
              <CardHeader><CardTitle>ملخّص النطاق</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.overview} resp={overview} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" /> التطور التاريخي (آخر شهور)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.history} resp={history} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>الكلمات العضوية الحالية</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.organic} resp={organic} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TOP PAGES */}
          <TabsContent value="pages" className="space-y-6 mt-6">
            <div className="flex justify-end">
              <Button onClick={loadTopPages} disabled={!!loadingMap.topPages}>
                <RefreshCw className={`h-4 w-4 ml-2 ${loadingMap.topPages ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>أفضل الصفحات أداءً</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.topPages} resp={topPages} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* BACKLINKS */}
          <TabsContent value="backlinks" className="space-y-6 mt-6">
            <div className="flex justify-end">
              <Button onClick={loadBacklinks} disabled={!!loadingMap.backlinks}>
                <RefreshCw className={`h-4 w-4 ml-2 ${loadingMap.backlinks ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>
            <Card>
              <CardHeader><CardTitle>نظرة عامة على الروابط الخلفية</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.backlinks} resp={backlinks} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>أهم المواقع المُحيلة</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.refdomains} resp={refdomains} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>نصوص الروابط (Anchors)</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.anchors} resp={anchors} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* KEYWORDS */}
          <TabsContent value="keywords" className="space-y-6 mt-6">
            <div className="flex justify-end">
              <Button onClick={loadKeyword} disabled={!!loadingMap.keyword}>
                <RefreshCw className={`h-4 w-4 ml-2 ${loadingMap.keyword ? 'animate-spin' : ''}`} />
                بحث
              </Button>
            </div>
            <Card>
              <CardHeader><CardTitle>بيانات الكلمة المفتاحية</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.keyword} resp={keywordData} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>كلمات مرتبطة (Related)</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.related} resp={relatedKw} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>أسئلة يبحث عنها الناس</CardTitle></CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.questions} resp={questions} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* QUOTA */}
          <TabsContent value="quota" className="space-y-6 mt-6">
            <div className="flex justify-end">
              <Button onClick={loadLimits} disabled={!!loadingMap.limits}>
                <RefreshCw className={`h-4 w-4 ml-2 ${loadingMap.limits ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>الحصة المتبقية في اشتراك Semrush</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultTable loading={!!loadingMap.limits} resp={limits} />
                <p className="mt-4 text-xs text-muted-foreground">
                  إذا ظهر الخطأ <Badge variant="outline">ERROR 134 :: TOTAL LIMIT EXCEEDED</Badge> فهذا
                  يعني أن حصة الاشتراك المجاني نفدت — انتظر إعادة التهيئة أو رقّ الاشتراك من
                  semrush.com.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-lg font-bold">{formatNumber(value)}</p>
      </CardContent>
    </Card>
  );
}

export default AdminSEO;