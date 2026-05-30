// محرك بحث الكتب بالذكاء الاصطناعي
// يستقبل سؤالاً بلغة طبيعية ويستخدم Gemini لاستخراج معايير البحث ثم يبحث في المكتبة
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// نموذج Mistral الأقوى — يفهم اللغة العربية ونية المستخدم
const MODEL = "mistral-large-latest";

interface AIQuery {
  keywords: string[];
  authors: string[];
  categories: string[];
  explanation: string;
}

async function interpretQuery(query: string): Promise<AIQuery> {
  const systemPrompt = `أنت محرك بحث ذكي لمكتبة كتب عربية ضخمة. مهمتك تحويل سؤال المستخدم إلى كلمات بحث دقيقة.
- استخرج كلمات مفتاحية مرتبطة بالعنوان أو الموضوع (بالعربية، 2-6 كلمات قصيرة).
- استخرج اسم المؤلف إن ذُكر صراحة.
- استخرج تصنيفات محتملة (مثل: روايات، تاريخ، فلسفة، تنمية ذاتية، دين، علوم، سياسة، شعر، أطفال).
- لا تخترع كتباً غير موجودة. ركز على المعاني المرادفة.`;

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "build_search_query",
            description: "بناء استعلام بحث منظم",
            parameters: {
              type: "object",
              properties: {
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "كلمات مفتاحية للبحث في العنوان أو الوصف",
                },
                authors: {
                  type: "array",
                  items: { type: "string" },
                  description: "أسماء المؤلفين المذكورين",
                },
                categories: {
                  type: "array",
                  items: { type: "string" },
                  description: "تصنيفات محتملة للكتاب",
                },
                explanation: {
                  type: "string",
                  description: "شرح موجز لما فهمه الذكاء الاصطناعي من السؤال (جملة قصيرة)",
                },
              },
              required: ["keywords", "authors", "categories", "explanation"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "build_search_query" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Mistral API ${res.status}: ${t}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI did not return structured query");
  const args = JSON.parse(toolCall.function.arguments);
  return {
    keywords: Array.isArray(args.keywords) ? args.keywords.slice(0, 8) : [],
    authors: Array.isArray(args.authors) ? args.authors.slice(0, 4) : [],
    categories: Array.isArray(args.categories) ? args.categories.slice(0, 6) : [],
    explanation: typeof args.explanation === "string" ? args.explanation : "",
  };
}

function escapeIlike(term: string) {
  return term.replace(/[%,_()]/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!MISTRAL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "مفتاح Mistral غير مهيأ" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { query, limit = 18 } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "اكتب سؤالك بوضوح" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const interpreted = await interpretQuery(query.trim());
    console.log("AI interpreted:", interpreted);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // تقليل عدد شروط البحث لتجنّب تجاوز مهلة قاعدة البيانات
    const topKeywords = interpreted.keywords.slice(0, 3);
    const topAuthors = interpreted.authors.slice(0, 2);
    const topCategories = interpreted.categories.slice(0, 2);
    const finalLimit = Math.min(24, Math.max(1, limit));

    type Row = {
      id: string;
      title: string;
      author: string | null;
      category: string | null;
      description: string | null;
      slug: string | null;
      rating: number | null;
      views: number | null;
      cover_image_url: string | null;
      s3_cover_image_url: string | null;
    };

    const SELECT_COLS =
      "id, title, author, category, description, slug, rating, views, cover_image_url, s3_cover_image_url";

    // ننفّذ عدة استعلامات صغيرة بالتوازي بدل OR ضخم واحد
    const queries: Promise<{ data: Row[] | null; error: any }>[] = [];

    for (const a of topAuthors) {
      const t = escapeIlike(a);
      if (t.length < 2) continue;
      queries.push(
        supabase
          .from("book_submissions")
          .select(SELECT_COLS)
          .eq("status", "approved")
          .ilike("author", `%${t}%`)
          .order("views", { ascending: false })
          .limit(finalLimit) as any,
      );
    }

    for (const c of topCategories) {
      const t = escapeIlike(c);
      if (t.length < 2) continue;
      queries.push(
        supabase
          .from("book_submissions")
          .select(SELECT_COLS)
          .eq("status", "approved")
          .ilike("category", `%${t}%`)
          .order("views", { ascending: false })
          .limit(finalLimit) as any,
      );
    }

    for (const k of topKeywords) {
      const t = escapeIlike(k);
      if (t.length < 2) continue;
      queries.push(
        supabase
          .from("book_submissions")
          .select(SELECT_COLS)
          .eq("status", "approved")
          .ilike("title", `%${t}%`)
          .order("views", { ascending: false })
          .limit(finalLimit) as any,
      );
    }

    // احتياط: لو لم يستخرج الذكاء شيئاً
    if (queries.length === 0) {
      const raw = escapeIlike(query);
      queries.push(
        supabase
          .from("book_submissions")
          .select(SELECT_COLS)
          .eq("status", "approved")
          .ilike("title", `%${raw}%`)
          .order("views", { ascending: false })
          .limit(finalLimit) as any,
      );
      queries.push(
        supabase
          .from("book_submissions")
          .select(SELECT_COLS)
          .eq("status", "approved")
          .ilike("author", `%${raw}%`)
          .order("views", { ascending: false })
          .limit(finalLimit) as any,
      );
    }

    const settled = await Promise.allSettled(queries);
    const merged = new Map<string, Row>();
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.data) {
        for (const row of s.value.data) {
          if (!merged.has(row.id)) merged.set(row.id, row);
        }
      } else if (s.status === "fulfilled" && s.value.error) {
        console.warn("partial query error:", s.value.error.message);
      }
    }

    const results = Array.from(merged.values())
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, finalLimit)
      .map((b: any) => ({
      ...b,
      cover_image_url: b.s3_cover_image_url || b.cover_image_url,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        query,
        interpretation: interpreted,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-library-search error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});