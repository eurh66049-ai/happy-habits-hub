import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";
const S3_BUCKET = "kotobi";
const S3_REGION = "eu-north-1";
const S3_PUBLIC_URL_PREFIX = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`;

interface BookRow {
  id: string;
  cover_image_url: string | null;
  book_file_url: string | null;
  s3_cover_image_url: string | null;
  s3_book_file_url: string | null;
}

async function getSignedPutUrl(objectKey: string, lovableKey: string, s3Key: string): Promise<string> {
  const res = await fetch(
    `${GATEWAY_BASE}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": s3Key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ object_path: objectKey }),
    },
  );
  if (!res.ok) throw new Error(`sign_storage_url [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return data.url as string;
}

function deriveObjectKey(supabaseUrl: string, kind: "cover" | "file"): string {
  const fileMarker = "/book-files/";
  const coverMarker = "/book-covers/";
  const marker = kind === "cover" ? coverMarker : fileMarker;
  const idx = supabaseUrl.indexOf(marker);
  if (idx !== -1) return supabaseUrl.substring(idx + marker.length);
  try {
    const u = new URL(supabaseUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    const filename = parts[parts.length - 1];
    return kind === "cover" ? `covers/${filename}` : `books/${filename}`;
  } catch {
    return `${kind === "cover" ? "covers" : "books"}/${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

function isSupabaseUrl(url: string | null | undefined): boolean {
  return !!url && url.includes("supabase.co") && !url.includes("amazonaws");
}

async function uploadToS3(
  sourceUrl: string,
  kind: "cover" | "file",
  lovableKey: string,
  s3Key: string,
): Promise<string> {
  const objectKey = deriveObjectKey(sourceUrl, kind);
  const dl = await fetch(sourceUrl);
  if (!dl.ok || !dl.body) throw new Error(`download ${dl.status}`);
  const contentType = dl.headers.get("content-type") ||
    (kind === "cover" ? "image/jpeg" : "application/pdf");
  const contentLength = dl.headers.get("content-length");
  const putUrl = await getSignedPutUrl(objectKey, lovableKey, s3Key);
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (contentLength) headers["Content-Length"] = contentLength;
  // Stream the body directly to S3 — never load into memory.
  const up = await fetch(putUrl, {
    method: "PUT",
    headers,
    body: dl.body,
  });
  if (!up.ok) throw new Error(`upload ${up.status}: ${await up.text().catch(() => "")}`);
  return `${S3_PUBLIC_URL_PREFIX}${objectKey}`;
}

async function migrateOne(
  book: BookRow,
  supabase: ReturnType<typeof createClient>,
  lovableKey: string,
  s3Key: string,
): Promise<{ id: string; cover?: string; file?: string; errors: string[] }> {
  const update: Record<string, string | null> = {};
  const errors: string[] = [];
  let coverNew: string | undefined;
  let fileNew: string | undefined;

  // ---- COVER ----
  if (isSupabaseUrl(book.cover_image_url) && !book.s3_cover_image_url) {
    try {
      coverNew = await uploadToS3(book.cover_image_url!, "cover", lovableKey, s3Key);
      // Keep Supabase URL untouched in cover_image_url; store S3 URL separately.
      update.s3_cover_image_url = coverNew;
    } catch (e) {
      errors.push(`cover: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---- FILE ----
  if (isSupabaseUrl(book.book_file_url) && !book.s3_book_file_url) {
    try {
      fileNew = await uploadToS3(book.book_file_url!, "file", lovableKey, s3Key);
      // Keep Supabase URL untouched in book_file_url; store S3 URL separately.
      update.s3_book_file_url = fileNew;
    } catch (e) {
      errors.push(`file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (Object.keys(update).length > 0 || errors.length > 0) {
    update.s3_migrated_at = new Date().toISOString();
    if (errors.length) {
      // أخطاء مؤقتة (rate limit, مشاكل شبكة) لا نسجلها كخطأ دائم حتى يعاد المحاولة تلقائياً
      const isTransient = errors.every((e) =>
        /\b(429|503|502|504|408|ECONNRESET|timeout|connection|rate.?limit|reset reason)\b/i.test(e)
      );
      if (!isTransient) {
        update.s3_migration_error = errors.join(" | ");
      }
    }
    const { error: updErr } = await supabase
      .from("book_submissions")
      .update(update)
      .eq("id", book.id);
    if (updErr) errors.push(`db: ${updErr.message}`);
  }

  // Small delay to avoid hitting the connectors gateway rate limit (429).
  await new Promise((r) => setTimeout(r, 500));

  return { id: book.id, cover: coverNew, file: fileNew, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !AWS_S3_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing required env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.max(1, Math.min(100, Number(body.batch_size) || 5));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find approved books still pointing at Supabase storage (cover OR file).
    const { data: books, error: selErr } = await supabase
      .from("book_submissions")
      .select("id, cover_image_url, book_file_url, s3_cover_image_url, s3_book_file_url, file_size")
      .eq("status", "approved")
      .or(
        "and(cover_image_url.ilike.%supabase.co%,s3_cover_image_url.is.null)," +
        "and(book_file_url.ilike.%supabase.co%,s3_book_file_url.is.null)",
      )
      // Skip books that already failed — they block the queue otherwise.
      // Clear s3_migration_error in DB to retry them.
      .is("s3_migration_error", null)
      .order("file_size", { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (selErr) {
      return new Response(JSON.stringify({ error: `select failed: ${selErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!books || books.length === 0) {
      return new Response(JSON.stringify({ done: true, message: "لا توجد كتب متبقية على Supabase" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bookList = books as unknown as BookRow[];

    // Background processing to avoid CPU/wall-time limits on large batches.
    // Process with limited concurrency.
    const CONCURRENCY = 1;
    const runAll = async () => {
      let i = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, bookList.length) }, async () => {
        while (i < bookList.length) {
          const idx = i++;
          const b = bookList[idx];
          try {
            const r = await migrateOne(b, supabase, LOVABLE_API_KEY, AWS_S3_API_KEY);
            console.log(`book ${b.id}: ${r.errors.length === 0 ? "OK" : "ERR " + r.errors.join(";")}`);
          } catch (e) {
            console.error(`book ${b.id} fatal:`, e instanceof Error ? e.message : String(e));
          }
        }
      });
      await Promise.all(workers);
      console.log(`✅ batch done: ${bookList.length} books processed`);
    };

    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runAll());
    } else {
      runAll();
    }

    return new Response(
      JSON.stringify({
        started: true,
        batch_size: bookList.length,
        message: `بدأت معالجة ${bookList.length} كتاب في الخلفية. حدّث الصفحة بعد دقيقة لرؤية التقدم.`,
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("migrate-books-to-s3 error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
