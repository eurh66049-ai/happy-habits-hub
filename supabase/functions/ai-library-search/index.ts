// محرك بحث الكتب بالذكاء الاصطناعي
// يستقبل سؤالاً بلغة طبيعية ويستخدم Gemini لاستخراج معايير البحث ثم يبحث في المكتبة
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// نموذج قوي يفهم اللغة العربية ونية المستخدم
const MODEL = "google/gemini-2.5-pro";

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

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
    throw new Error(`AI gateway ${res.status}: ${t}`);
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
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "خدمة الذكاء الاصطناعي غير مهيأة" }),
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

    // بناء شروط OR
    const orParts: string[] = [];
    for (const k of interpreted.keywords) {
      const t = escapeIlike(k);
      if (t.length < 2) continue;
      orParts.push(`title.ilike.%${t}%`);
      orParts.push(`description.ilike.%${t}%`);
    }
    for (const a of interpreted.authors) {
      const t = escapeIlike(a);
      if (t.length < 2) continue;
      orParts.push(`author.ilike.%${t}%`);
    }
    for (const c of interpreted.categories) {
      const t = escapeIlike(c);
      if (t.length < 2) continue;
      orParts.push(`category.ilike.%${t}%`);
    }

    // احتياط: لو الذكاء لم يستخرج شيئاً، ابحث بالنص الأصلي
    if (orParts.length === 0) {
      const raw = escapeIlike(query);
      orParts.push(`title.ilike.%${raw}%`);
      orParts.push(`author.ilike.%${raw}%`);
      orParts.push(`description.ilike.%${raw}%`);
    }

    const { data, error } = await supabase
      .from("book_submissions")
      .select(
        "id, title, author, category, description, slug, rating, views, cover_image_url, s3_cover_image_url",
      )
      .eq("status", "approved")
      .or(orParts.join(","))
      .order("views", { ascending: false })
      .limit(Math.min(40, Math.max(1, limit)));

    if (error) {
      console.error("DB search error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = (data || []).map((b: any) => ({
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