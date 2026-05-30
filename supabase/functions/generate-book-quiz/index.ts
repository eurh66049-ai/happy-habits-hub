// Generate a quiz from a book's extracted text using Mistral Large.
// Caches the result in book_quizzes so repeat requests are free.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL = "mistral-large-latest";

type Difficulty = "easy" | "medium" | "hard";

interface Question {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
}

function sample(text: string, totalChars = 14000): string {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= totalChars) return cleaned;
  const chunks = 4;
  const size = Math.floor(totalChars / chunks);
  const step = Math.floor(cleaned.length / (chunks + 1));
  const parts: string[] = [];
  for (let i = 1; i <= chunks; i++) {
    const start = step * i;
    parts.push(cleaned.slice(start, start + size));
  }
  return parts.join("\n---\n");
}

async function generateQuiz(
  apiKey: string,
  bookTitle: string,
  bookAuthor: string,
  text: string,
  difficulty: Difficulty,
  count: number,
): Promise<Question[]> {
  const difficultyAr =
    difficulty === "easy" ? "سهل (أسئلة مباشرة)" :
    difficulty === "hard" ? "صعب (يتطلب فهم عميق وربط بين الأفكار)" :
    "متوسط (فهم جيد للأفكار الرئيسية)";

  const prompt = `كتاب: "${bookTitle}" — المؤلف: ${bookAuthor}

أنشئ ${count} سؤال اختيار من متعدد بمستوى ${difficultyAr}، مبنية حصراً على النص أدناه.
شروط صارمة:
- كل سؤال له 4 خيارات نصية مختلفة وواضحة.
- خيار واحد فقط صحيح ومستند إلى النص.
- لا تخترع معلومات غير موجودة في النص.
- ممنوع تكرار الأسئلة.
- اللغة: العربية الفصحى البسيطة.
- أضف تفسيراً قصيراً (جملة واحدة) لكل سؤال.

أعد JSON بهذه الصيغة فقط:
{"questions":[{"question":"...","options":["أ","ب","ج","د"],"correct_index":0,"explanation":"..."}]}

النص:
${sample(text)}`;

  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [
        { role: "system", content: "أنت مولِّد اختبارات تعليمية دقيق. تعيد JSON فقط دون أي شرح خارجي." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 3500,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Mistral ${res.status}: ${t}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  const qs: Question[] = Array.isArray(parsed.questions) ? parsed.questions : [];
  return qs
    .filter((q) =>
      q && typeof q.question === "string" &&
      Array.isArray(q.options) && q.options.length === 4 &&
      Number.isInteger(q.correct_index) &&
      q.correct_index >= 0 && q.correct_index <= 3
    )
    .slice(0, count);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bookId, difficulty = "medium", questionCount = 10, forceRefresh = false } =
      await req.json() as { bookId: string; difficulty?: Difficulty; questionCount?: number; forceRefresh?: boolean };

    if (!bookId) {
      return new Response(JSON.stringify({ error: "bookId مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) {
      return new Response(JSON.stringify({ error: "MISTRAL_API_KEY غير مُهيأ" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const count = Math.min(Math.max(Number(questionCount) || 10, 3), 20);
    const diff: Difficulty = (["easy", "medium", "hard"] as const).includes(difficulty as Difficulty)
      ? difficulty as Difficulty : "medium";

    // Cache lookup
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("book_quizzes")
        .select("id, questions")
        .eq("book_id", bookId)
        .eq("difficulty", diff)
        .eq("question_count", count)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached?.questions) {
        return new Response(JSON.stringify({ quizId: cached.id, questions: cached.questions, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch book + text
    const [{ data: book }, { data: textRow }] = await Promise.all([
      supabase.from("book_submissions").select("title, author").eq("id", bookId).maybeSingle(),
      supabase.from("book_extracted_text").select("extracted_text, extraction_status").eq("book_id", bookId).maybeSingle(),
    ]);

    if (!textRow?.extracted_text || textRow.extraction_status !== "completed" || textRow.extracted_text.length < 500) {
      return new Response(JSON.stringify({ error: "نص الكتاب غير متوفر لتوليد اختبار" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const questions = await generateQuiz(
      MISTRAL_API_KEY,
      book?.title ?? "كتاب",
      book?.author ?? "—",
      textRow.extracted_text,
      diff,
      count,
    );

    if (questions.length === 0) {
      return new Response(JSON.stringify({ error: "تعذر توليد أسئلة" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inserted } = await supabase
      .from("book_quizzes")
      .insert({ book_id: bookId, difficulty: diff, question_count: count, questions })
      .select("id")
      .single();

    return new Response(JSON.stringify({ quizId: inserted?.id, questions, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate-book-quiz error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
