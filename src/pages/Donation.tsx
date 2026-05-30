import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Heart, Database, Users, Target, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/seo/SEOHead";

// PayPal types
declare global {
  interface Window {
    paypal?: any;
  }
}

const SUPABASE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PRESET_AMOUNTS = [3, 5, 10, 20];

const Donation = () => {
  const [currentAmount, setCurrentAmount] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState<number>(5);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalEnv, setPaypalEnv] = useState<string>("");
  const { toast } = useToast();

  const targetAmount = 30;
  const progressPercentage = Math.min((currentAmount / targetAmount) * 100, 100);
  const remainingAmount = Math.max(targetAmount - currentAmount, 0);

  const selectedAmountRef = React.useRef(selectedAmount);
  useEffect(() => { selectedAmountRef.current = selectedAmount; }, [selectedAmount]);

  // Load PayPal SDK with the client-id from server (sandbox or live based on env)
  useEffect(() => {
    sessionStorage.setItem('donation_page_visited', 'true');
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${SUPABASE_FN_URL}/paypal-config`, {
          headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        });
        const cfg = await res.json();
        if (cancelled) return;
        const isPlaceholder = !cfg.clientId || /placeholder/i.test(String(cfg.clientId));
        if (isPlaceholder) {
          toast({
            title: "PayPal غير مُهيّأ",
            description: "مفاتيح PayPal على Supabase ما زالت قيماً مؤقتة (PLACEHOLDER). يجب تعيين PAYPAL_CLIENT_ID و PAYPAL_CLIENT_SECRET و PAYPAL_ENV الحقيقية في Edge Functions Secrets.",
            variant: "destructive",
          });
          return;
        }
        setPaypalEnv(cfg.env || "live");

        const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&currency=${cfg.currency || "USD"}&intent=capture&disable-funding=venmo`;
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
        if (existing && window.paypal) {
          setPaypalReady(true);
          return;
        }
        const s = existing ?? document.createElement('script');
        if (!existing) {
          s.src = src;
          s.async = true;
          document.head.appendChild(s);
        }
        s.onload = () => !cancelled && setPaypalReady(true);
      } catch (e) {
        console.error('paypal-config error:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [toast]);

  // Render PayPal Buttons whenever SDK is ready
  useEffect(() => {
    if (!paypalReady || !window.paypal?.Buttons) return;
    const container = document.getElementById("paypal-buttons-container");
    if (!container) return;
    container.innerHTML = "";

    try {
      window.paypal.Buttons({
        style: { layout: "vertical", color: "gold", shape: "rect", label: "donate" },
        createOrder: async () => {
          sessionStorage.setItem('donation_initiated', 'true');
          const res = await fetch(`${SUPABASE_FN_URL}/paypal-create-order`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON,
              Authorization: `Bearer ${SUPABASE_ANON}`,
            },
            body: JSON.stringify({ amount: selectedAmountRef.current }),
          });
          const data = await res.json();
          if (!res.ok || !data.id) throw new Error(data?.error?.message || "Failed to create order");
          return data.id;
        },
        onApprove: async (data: any) => {
          const res = await fetch(`${SUPABASE_FN_URL}/paypal-capture-order`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON,
              Authorization: `Bearer ${SUPABASE_ANON}`,
            },
            body: JSON.stringify({ orderId: data.orderID }),
          });
          const out = await res.json();
          if (out.status === "COMPLETED") {
            toast({ title: "شكراً لك! 💖", description: "تم استلام تبرعك بنجاح." });
            setCurrentAmount((a) => a + selectedAmountRef.current);
          } else {
            toast({ title: "تعذّر إتمام الدفع", description: JSON.stringify(out), variant: "destructive" });
          }
        },
        onError: (err: any) => {
          console.error('PayPal error:', err);
          toast({ title: "خطأ في PayPal", description: String(err?.message || err), variant: "destructive" });
        },
      }).render("#paypal-buttons-container");
    } catch (error) {
      console.error('PayPal render error:', error);
    }
  }, [paypalReady, toast]);

  return (
    <>
      <SEOHead
        title="ادعم مكتبتنا الرقمية - تبرع لمنصة كتبي"
        description="ساعدنا في الحفاظ على مكتبة الكتب المجانية وتوفير المحتوى التعليمي للجميع. تبرع الآن لدعم منصة كتبي المجانية بدون إعلانات مزعجة."
        keywords="تبرع, دعم, مكتبة رقمية, كتب مجانية, منصة كتبي, تبرعات, مساعدة, محتوى تعليمي, مكتبة عربية"
        canonical="https://kotobi.xyz/donation"
        ogType="website"
        ogImage="/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png"
      />
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="container mx-auto px-4 py-8 max-w-4xl"
           style={{ 
             fontFamily: 'Tajawal, sans-serif',
             fontWeight: '400',
             fontSize: '18px',
             lineHeight: '1.7'
           }}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
                style={{ 
                  fontFamily: 'Tajawal, sans-serif',
                  fontWeight: '400',
                  fontSize: 'clamp(28px, 5vw, 36px)'
                }}>
              ادعم مكتبتنا الرقمية
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto"
             style={{ 
               fontFamily: 'Tajawal, sans-serif',
               fontWeight: '400',
               fontSize: '20px',
               lineHeight: '1.8'
             }}>
            ساعدنا في الحفاظ على مكتبة الكتب المجانية وتوفير المحتوى التعليمي للجميع
          </p>
          
          {/* No Ads Message */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
            <div className="text-center">
              <h3 className="text-lg font-bold text-foreground mb-2"
                  style={{ 
                    fontFamily: 'Tajawal, sans-serif',
                    fontWeight: '400',
                    fontSize: '18px'
                  }}>
                📱 موقع بدون إعلانات مزعجة
              </h3>
              <p className="text-sm text-muted-foreground"
                 style={{ 
                   fontFamily: 'Tajawal, sans-serif',
                   fontWeight: '400',
                   fontSize: '15px',
                   lineHeight: '1.6'
                 }}>
                نحن نرفض وضع الإعلانات المزعجة في موقعنا لتوفير تجربة قراءة مريحة وممتعة للجميع.<br/>
                بدلاً من ذلك، نعتمد على تبرعاتكم الكريمة للحفاظ على الخدمة مجانية ونظيفة.
              </p>
            </div>
          </div>

          {/* Donation Examples */}
          <div className="mt-4 p-4 bg-accent/50 rounded-lg border border-border">
            <div className="text-center">
              <h3 className="text-lg font-bold text-foreground mb-3"
                  style={{ 
                    fontFamily: 'Tajawal, sans-serif',
                    fontWeight: '400',
                    fontSize: '18px'
                  }}>
                ✨ ساعدنا في بناء شيء رائع
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-3xl mb-2">🌱</div>
                  <p className="text-sm text-foreground font-bold">
                    ازرع بذرة المعرفة
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    كل تبرع صغير يساعد في نمو المكتبة
                  </p>
                </div>
                <div className="text-center p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-3xl mb-2">🚀</div>
                  <p className="text-sm text-foreground font-bold">
                    انطلق معنا للمستقبل
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    استثمر في مشروع تعليمي يخدم الجميع
                  </p>
                </div>
                <div className="text-center p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-3xl mb-2">💎</div>
                  <p className="text-sm text-foreground font-bold">
                    كن جزءاً من القصة
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ساهم في بناء مكتبة رقمية للأجيال القادمة
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm text-center text-foreground font-bold"
                   style={{ 
                     fontFamily: 'Tajawal, sans-serif',
                     fontWeight: '400',
                     fontSize: '14px',
                     lineHeight: '1.6'
                   }}>
                  🌟 كل دولار تتبرع به اليوم سيعود عليك بالمعرفة والفائدة مضاعفة غداً
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Donation Options */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"
                       style={{ 
                         fontFamily: 'Tajawal, sans-serif',
                         fontWeight: '400',
                         fontSize: '22px'
                       }}>
              <Gift className="h-5 w-5" />
              تبرع لدعم المكتبة
            </CardTitle>
            <CardDescription style={{ 
                               fontFamily: 'Tajawal, sans-serif',
                               fontWeight: '400',
                               fontSize: '16px'
                             }}>
              كل مساهمة تساعد في الحفاظ على الخدمة مجانية للجميع
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* PayPal Hosted Button */}
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-secondary/10 to-primary/10 p-6 rounded-lg border border-secondary/20">
                <div className="flex flex-col items-center space-y-4">
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-primary" />
                    <span className="font-bold text-foreground" 
                          style={{ 
                            fontFamily: 'Tajawal, sans-serif',
                            fontWeight: '400',
                            fontSize: '16px'
                          }}>
                      تبرع بالمبلغ الذي تراه مناسباً
                    </span>
                  </div>
                  
                  {/* Amount selector */}
                  <div className="w-full">
                    <p className="text-sm text-foreground font-bold mb-2 text-center"
                       style={{ fontFamily: 'Tajawal, sans-serif', fontSize: '14px' }}>
                      اختر مبلغ التبرع (USD)
                    </p>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {PRESET_AMOUNTS.map((amt) => (
                        <Button
                          key={amt}
                          type="button"
                          variant={selectedAmount === amt ? "default" : "outline"}
                          onClick={() => setSelectedAmount(amt)}
                          className="font-bold"
                        >
                          ${amt}
                        </Button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={selectedAmount}
                      onChange={(e) => setSelectedAmount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-center font-bold"
                      placeholder="أدخل مبلغاً مخصصاً"
                    />
                  </div>

                  {/* PayPal Buttons Container (dynamic SDK) */}
                  {/* خلفية بيضاء دائمة لضمان وضوح نصوص PayPal داخل الـ iframe في الوضع المظلم */}
                  <div
                    id="paypal-buttons-container"
                    className="w-full min-h-[50px] bg-white rounded-md p-3"
                    style={{ colorScheme: 'light' }}
                  ></div>

                  {paypalEnv === "sandbox" && (
                    <Badge variant="secondary" className="text-xs">
                      🧪 وضع الاختبار (Sandbox) — لا يتم خصم أموال حقيقية
                    </Badge>
                  )}

                  <p className="text-xs text-center text-muted-foreground"
                     style={{
                       fontFamily: 'Tajawal, sans-serif',
                       fontWeight: '400',
                       fontSize: '13px'
                     }}>
                    تبرع بأمان باستخدام PayPal بالمبلغ الذي تختاره
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Why Donate Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"
                       style={{ 
                         fontFamily: 'Tajawal, sans-serif',
                         fontWeight: '400',
                         fontSize: '22px'
                       }}>
              <Database className="h-5 w-5" />
              لماذا نحتاج التبرعات؟
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 style={{ 
                         fontFamily: 'Tajawal, sans-serif',
                         fontWeight: '400',
                         fontSize: '18px'
                       }}>تخزين قاعدة البيانات</h3>
                    <p className="text-sm text-muted-foreground"
                       style={{ 
                         fontFamily: 'Tajawal, sans-serif',
                         fontWeight: '400',
                         fontSize: '15px'
                       }}>
                      تكلفة استضافة وتخزين آلاف الكتب والملفات
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                    <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 style={{ 
                         fontFamily: 'Tajawal, sans-serif',
                         fontWeight: '400',
                         fontSize: '18px'
                       }}>تحديثات وتحسينات</h3>
                    <p className="text-sm text-muted-foreground"
                       style={{ 
                         fontFamily: 'Tajawal, sans-serif',
                         fontWeight: '400',
                         fontSize: '15px'
                       }}>
                      تطوير الموقع وإضافة مميزات جديدة
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Thank You Message */}
        <div className="text-center p-6 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg border border-primary/20 mb-20">
          <Heart className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2"
              style={{ 
                fontFamily: 'Tajawal, sans-serif',
                fontWeight: '400',
                fontSize: '24px'
              }}>شكراً لدعمك</h3>
          <p className="text-muted-foreground"
             style={{ 
               fontFamily: 'Tajawal, sans-serif',
               fontWeight: '400',
               fontSize: '17px'
             }}>
            كل تبرع يساعد في بناء مجتمع تعليمي أفضل ومحتوى مجاني للجميع
          </p>
        </div>
      </div>
    </div>
    </>
  );
};

export default Donation;