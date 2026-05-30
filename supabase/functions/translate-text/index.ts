// Translate text - ترجمة فورية مع دعم استخراج النص بصرياً (OCR) للكتب الممسوحة ضوئياً
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
const MAX_LEN = 4000;

async function mistralOcr(imageDataUrl: string): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-2512",
      document: { type: "image_url", image_url: imageDataUrl },
      include_image_base64: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Mistral OCR failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  const md = pages.map((p: any) => (typeof p?.markdown === "string" ? p.markdown : "")).join("\n\n");
  return md.trim();
}

const LANG_NAMES: Record<string, string> = {
  ar: "العربية", en: "English", fr: "Français", es: "Español",
  de: "Deutsch", tr: "Türkçe", it: "Italiano", pt: "Português",
  ru: "Русский", zh: "中文", ja: "日本語", ko: "한국어",
  hi: "हिन्दी", ur: "اردو", fa: "فارسی", id: "Bahasa Indonesia",
};

async function mistralChat(body: unknown) {
  return await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!MISTRAL_API_KEY) {
      return new Response(JSON.stringify({ error: "MISTRAL_API_KEY غير مهيأ" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, targetLang = "en", sourceLang, imageDataUrl } = await req.json();
    const hasText = typeof text === "string" && text.trim().length >= 2;
    const hasImage = typeof imageDataUrl === "string" && imageDataUrl.startsWith("data:image/");

    if (!hasText && !hasImage) {
      return new Response(JSON.stringify({ error: "text or imageDataUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetName = LANG_NAMES[targetLang] || targetLang;
    const fromHint = sourceLang && LANG_NAMES[sourceLang] ? ` من ${LANG_NAMES[sourceLang]}` : "";

    let usedOcr = false;
    let extractedSource = hasText ? (text as string).trim().slice(0, MAX_LEN) : "";

    if (!hasText) {
      // استخراج النص بدقة عبر mistral-ocr-latest
      usedOcr = true;
      try {
        const ocrText = await mistralOcr(imageDataUrl as string);
        if (!ocrText || ocrText.length < 2) {
          return new Response(JSON.stringify({ error: "تعذر استخراج أي نص من الصفحة" }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        extractedSource = ocrText.slice(0, MAX_LEN);
      } catch (e) {
        console.error("Mistral OCR error:", e);
        return new Response(JSON.stringify({ error: "فشل استخراج النص من الصورة" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ترجمة عبر أقوى نموذج لدى Mistral: mistral-large-latest
    const res = await mistralChat({
      model: "mistral-large-latest",
      messages: [
        {
          role: "system",
          content: `أنت مترجم محترف عالي الدقة. ترجم النص${fromHint} إلى ${targetName} مع الحفاظ التام على المعنى والأسلوب الأدبي والتنسيق (الفقرات، علامات الترقيم، القوائم). أرجع الترجمة فقط بدون أي شرح أو مقدمة أو تعليق.`,
        },
        { role: "user", content: extractedSource },
      ],
      temperature: 0.2,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Translate AI error:", res.status, body);
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "نفد الرصيد المخصص للذكاء الاصطناعي" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Translation error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    const translation = (json.choices?.[0]?.message?.content ?? "").trim();

    return new Response(JSON.stringify({
      translation,
      source: extractedSource,
      usedOcr,
      targetLang,
      targetLangName: targetName,
      truncated: hasText && (text as string).length > MAX_LEN,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("translate-text error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
