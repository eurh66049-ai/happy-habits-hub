import { supabase } from "@/integrations/supabase/client";

export const S3_BUCKET = "kotobi";
export const S3_REF_PREFIX = `s3://${S3_BUCKET}/`;

/**
 * مرجع كتاب مخزن في S3 يبدأ بـ s3://kotobi/<object_key>
 * نحفظ هذا الشكل في قاعدة البيانات بدل URL مباشر،
 * لأن ملفات S3 ليست عامة وتحتاج signed URL في كل مرة.
 */
export function makeS3Reference(objectKey: string): string {
  return `${S3_REF_PREFIX}${objectKey.replace(/^\/+/, "")}`;
}

export function isS3Reference(value: string | null | undefined): boolean {
  return !!value && value.startsWith(S3_REF_PREFIX);
}

export function extractS3Key(reference: string): string {
  return reference.replace(S3_REF_PREFIX, "");
}

interface SignedUrlResponse {
  url: string;
  method?: string;
  expires_in?: number;
}

async function callSignFunction(
  mode: "read" | "write",
  objectPath: string,
): Promise<SignedUrlResponse> {
  const { data, error } = await supabase.functions.invoke("s3-sign-url", {
    body: { mode, object_path: objectPath },
  });

  if (error) {
    throw new Error(`فشل الحصول على رابط S3: ${error.message}`);
  }

  if (!data || typeof data !== "object" || !("url" in data)) {
    throw new Error("استجابة غير متوقعة من خدمة S3");
  }

  return data as SignedUrlResponse;
}

export async function getS3UploadUrl(objectKey: string): Promise<SignedUrlResponse> {
  return callSignFunction("write", objectKey);
}

export async function getS3DownloadUrl(objectKey: string): Promise<SignedUrlResponse> {
  return callSignFunction("read", objectKey);
}

/**
 * يبني مفتاح S3 مع طابع زمني ومعرف عشوائي لتفادي التصادم.
 */
export function buildS3ObjectKey(folder: string, originalName: string): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop() : "";
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const safeFolder = folder.replace(/^\/+|\/+$/g, "");
  const fileName = ext ? `${timestamp}_${randomId}.${ext}` : `${timestamp}_${randomId}`;
  return safeFolder ? `${safeFolder}/${fileName}` : fileName;
}

/**
 * يرفع ملفاً إلى S3 عبر signed URL ويُرجع المرجع s3://kotobi/<key>
 */
export async function uploadFileToS3(
  file: File,
  folder: string,
  onProgress?: (percent: number) => void,
): Promise<{ reference: string; objectKey: string }> {
  const objectKey = buildS3ObjectKey(folder, file.name);
  const { url } = await getS3UploadUrl(objectKey);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    if (file.type) {
      xhr.setRequestHeader("Content-Type", file.type);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`فشل الرفع إلى S3 [${xhr.status}]: ${xhr.responseText || "خطأ غير معروف"}`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "تعذّر الاتصال بـ S3. تحقّق من إعدادات CORS على bucket كتبي والسماح للأصل الحالي.",
        ),
      );
    xhr.send(file);
  });

  return {
    reference: makeS3Reference(objectKey),
    objectKey,
  };
}

/**
 * يحوّل المرجع المخزن (سواء s3://... أو URL عادي) إلى URL قابل للتحميل/العرض.
 * - إذا كان المرجع s3://kotobi/... → يُولّد signed URL مؤقت
 * - وإلا (Supabase Storage URL أو رابط خارجي) → يُعيده كما هو
 */
export async function resolveBookFileUrl(
  storedUrl: string | null | undefined,
): Promise<string | null> {
  if (!storedUrl) return null;
  if (!isS3Reference(storedUrl)) return storedUrl;

  const objectKey = extractS3Key(storedUrl);
  const { url } = await getS3DownloadUrl(objectKey);
  return url;
}