// Batch-embed approved books for semantic search
// Admin-protected: requires admin user
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMBED_MODEL = "openai/text-embedding-3-small";
const EMBED_DIMS = 1024;
const MAX_INPUT_LEN = 6000;

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: inputs,
      dimensions: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding error ${res.status}: ${body}`);
  }
  const json = await res.json();
  return (json.data as Array<{ embedding: number[]; index: number }>)
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

function buildText(b: { title: string; author: string; category?: string | null; description?: string | null }) {
  const parts = [
    `العنوان: ${b.title}`,
    `المؤلف: ${b.author}`,
    b.category ? `التصنيف: ${b.category}` : "",
    b.description ? `الوصف: ${b.description}` : "",
  ].filter(Boolean);
  return parts.join("\n").slice(0, MAX_INPUT_LEN);
}

async function hashText(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: admin user OR service role / anon key (for pg_cron scheduled runs)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isCron = bearer.length > 0 && (bearer === SERVICE_ROLE || bearer === ANON_KEY);



    if (!isCron) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }



    const { batchSize = 50 } = await req.json().catch(() => ({}));
    const limit = Math.min(100, Math.max(1, batchSize));

    // Pick approved books not yet embedded with current model
    const { data: books, error: booksErr } = await supabase
      .from("book_submissions")
      .select("id, title, author, category, description")
      .eq("status", "approved")
      .not("id", "in", `(select book_id from public.book_embeddings where model = '${EMBED_MODEL}')`)
      .limit(limit);

    if (booksErr) {
      // Fallback: use a manual two-query approach
      const { data: existing } = await supabase
        .from("book_embeddings")
        .select("book_id")
        .eq("model", EMBED_MODEL)
        .limit(50000);
      const existingIds = new Set((existing ?? []).map((e: { book_id: string }) => e.book_id));
      const { data: allBooks } = await supabase
        .from("book_submissions")
        .select("id, title, author, category, description")
        .eq("status", "approved")
        .limit(limit + existingIds.size + 100);
      const candidates = (allBooks ?? []).filter((b: { id: string }) => !existingIds.has(b.id)).slice(0, limit);
      if (candidates.length === 0) {
        return new Response(JSON.stringify({ processed: 0, message: "no pending books" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const texts = candidates.map(buildText);
      const vectors = await embedBatch(texts);
      const rows = await Promise.all(candidates.map(async (b, i) => ({
        book_id: b.id,
        embedding: vectors[i] as unknown as string,
        content_hash: await hashText(texts[i]),
        model: EMBED_MODEL,
      })));
      const { error: upErr } = await supabase.from("book_embeddings").upsert(rows, { onConflict: "book_id,model" });
      if (upErr) throw upErr;
      return new Response(JSON.stringify({ processed: candidates.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!books || books.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "no pending books" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const texts = books.map(buildText);
    const vectors = await embedBatch(texts);
    const rows = await Promise.all(books.map(async (b, i) => ({
      book_id: b.id,
      embedding: vectors[i] as unknown as string,
      content_hash: await hashText(texts[i]),
      model: EMBED_MODEL,
    })));
    const { error: upErr } = await supabase.from("book_embeddings").upsert(rows, { onConflict: "book_id,model" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ processed: books.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("embed-books-batch error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
