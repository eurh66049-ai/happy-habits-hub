// رفع ملف من Supabase Storage إلى S3 (kotobi bucket) عبر بوابة Lovable.
// يعيد رابط S3 العام عند النجاح، أو null عند الفشل (مع تسجيل الخطأ).
// لا يحذف الملف من Supabase.

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";
const S3_BUCKET = "kotobi";
const S3_REGION = "eu-north-1";
const S3_PUBLIC_PREFIX = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`;

export function deriveObjectKeyFromSupabaseUrl(supabaseUrl: string): string {
  // .../storage/v1/object/public/book-files/books/<filename>
  // .../storage/v1/object/public/book-covers/covers/<filename>
  const fileMarker = "/book-files/";
  const coverMarker = "/book-covers/";
  const fi = supabaseUrl.indexOf(fileMarker);
  if (fi !== -1) return supabaseUrl.substring(fi + fileMarker.length);
  const ci = supabaseUrl.indexOf(coverMarker);
  if (ci !== -1) return supabaseUrl.substring(ci + coverMarker.length);
  try {
    const u = new URL(supabaseUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    return `books/${parts[parts.length - 1]}`;
  } catch {
    return `books/${Date.now()}_${Math.random().toString(36).slice(2, 11)}.pdf`;
  }
}

async function getSignedPutUrl(objectKey: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
  if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) {
    throw new Error("Missing LOVABLE_API_KEY / AWS_S3_API_KEY");
  }
  const res = await fetch(
    `${GATEWAY_BASE}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": AWS_S3_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ object_path: objectKey }),
    },
  );
  if (!res.ok) {
    throw new Error(`sign_storage_url [${res.status}]: ${await res.text()}`);
  }
  const data = await res.json();
  return data.url as string;
}

/**
 * يرفع نسخة من ملف Supabase Storage إلى S3 ويُعيد رابط S3 العام.
 * إذا كان الرابط أصلاً على S3 يعيده كما هو.
 * عند الفشل يعيد null والاحتفاظ بالرابط الأصلي مسؤولية المتصل.
 */
export async function mirrorSupabaseFileToS3(
  supabaseFileUrl: string,
): Promise<string | null> {
  try {
    if (!supabaseFileUrl) return null;
    if (supabaseFileUrl.includes("amazonaws.com") || supabaseFileUrl.includes(S3_BUCKET + ".s3")) {
      return supabaseFileUrl;
    }
    if (!supabaseFileUrl.includes("supabase.co")) {
      // ليس رابط Supabase معروف — تخطّى
      return null;
    }

    const objectKey = deriveObjectKeyFromSupabaseUrl(supabaseFileUrl);

    const dl = await fetch(supabaseFileUrl);
    if (!dl.ok) {
      console.warn(`[S3 mirror] فشل تنزيل ${supabaseFileUrl}: ${dl.status}`);
      return null;
    }
    const contentType = dl.headers.get("content-type") || "application/pdf";
    const buf = await dl.arrayBuffer();

    const putUrl = await getSignedPutUrl(objectKey);
    const up = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: buf,
    });
    if (!up.ok) {
      console.warn(`[S3 mirror] فشل رفع ${objectKey}: ${up.status}`);
      return null;
    }

    const finalUrl = `${S3_PUBLIC_PREFIX}${objectKey}`;
    console.log(`[S3 mirror] ✅ ${objectKey}`);
    return finalUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[S3 mirror] خطأ: ${msg}`);
    return null;
  }
}
