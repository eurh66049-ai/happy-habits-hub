// Send push notification via Firebase Cloud Messaging HTTP v1 API
// Uses Service Account JSON to mint a short-lived OAuth2 token
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  user_id?: string;
  title: string;
  message: string;
  target_url?: string;
  type?: string;
  send_to_all?: boolean;
}

// ---------- Service Account → OAuth2 access token ----------
function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const keyData = pemToArrayBuffer(serviceAccount.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(enc))
  );
  const jwt = `${enc}.${base64UrlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OAuth token error: ${JSON.stringify(data)}`);
  }
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

// ---------- Send to a single token ----------
async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  targetUrl?: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const fullUrl =
    targetUrl && targetUrl.startsWith("http")
      ? targetUrl
      : `https://kotobi.xyz${targetUrl || "/"}`;

  const payload = {
    message: {
      token,
      // notification field guarantees the OS shows title + body even when the
      // tab is fully closed and the service worker can't run.
      notification: { title, body },
      webpush: {
        fcm_options: { link: fullUrl },
        headers: { Urgency: "high" },
        notification: {
          title,
          body,
          icon: "/lovable-uploads/5882b036-f2e2-4fec-bc07-9ee97960056a.png",
          badge: "/favicon.png",
          dir: "rtl",
          lang: "ar",
          tag: `kotobi-${Date.now()}`,
          requireInteraction: false,
        },
      },
      // data is still sent so foreground onMessage handler can use it
      data: { url: fullUrl, title, body },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, error: errText };
  }
  return { ok: true, status: res.status };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountRaw) {
      return new Response(JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let serviceAccount: any;
    try {
      const raw = serviceAccountRaw.trim().replace(/^\uFEFF/, "");
      try {
        serviceAccount = JSON.parse(raw);
      } catch {
        // Fallback: secret may contain literal newlines inside private_key.
        // JSON.parse rejects raw \n in strings — escape them and retry.
        const fixed = raw.replace(/"private_key"\s*:\s*"([\s\S]*?)"(?=\s*[,}])/, (_m, key) => {
          const escaped = key.replace(/\r/g, "").replace(/\n/g, "\\n");
          return `"private_key":"${escaped}"`;
        });
        serviceAccount = JSON.parse(fixed);
      }
      if (typeof serviceAccount.private_key === "string") {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
      if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
        throw new Error("missing client_email/private_key/project_id");
      }
    } catch (e) {
      console.error("[FCM] Invalid service account JSON:", e);
      return new Response(JSON.stringify({ error: "Invalid FIREBASE_SERVICE_ACCOUNT_JSON", details: String(e) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: NotificationPayload = await req.json();
    const { user_id, title, message, target_url, send_to_all } = payload;

    if (!title || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields: title, message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch target FCM tokens
    let query = supabaseClient.from("fcm_tokens").select("token").eq("is_active", true);
    if (send_to_all) {
      // all tokens
    } else if (user_id) {
      query = query.eq("user_id", user_id);
    } else {
      return new Response(JSON.stringify({ error: "Must provide user_id or send_to_all=true" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokens, error: tokensError } = await query;
    if (tokensError) {
      console.error("[FCM] Tokens fetch error:", tokensError);
      return new Response(JSON.stringify({ error: "Failed to fetch tokens" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: "no tokens" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    await Promise.all(
      tokens.map(async (t) => {
        const result = await sendToToken(accessToken, projectId, t.token, title, message, target_url);
        if (result.ok) {
          sent++;
        } else {
          failed++;
          // 404 / UNREGISTERED → token is invalid, deactivate
          if (result.status === 404 || result.status === 400) {
            if (result.error?.includes("UNREGISTERED") || result.error?.includes("INVALID_ARGUMENT")) {
              invalidTokens.push(t.token);
            }
          }
          console.error(`[FCM] Send failed (${result.status}):`, result.error);
        }
      })
    );

    // Deactivate invalid tokens
    if (invalidTokens.length > 0) {
      await supabaseClient
        .from("fcm_tokens")
        .update({ is_active: false })
        .in("token", invalidTokens);
    }

    console.log(`[FCM] sent=${sent} failed=${failed} invalidated=${invalidTokens.length}`);

    return new Response(
      JSON.stringify({ success: true, sent, failed, invalidated: invalidTokens.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[FCM] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
