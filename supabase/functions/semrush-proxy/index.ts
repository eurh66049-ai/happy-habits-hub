// Proxy requests from the Kotobi admin SEO dashboard to the Lovable
// connector gateway for Semrush. Keeps LOVABLE_API_KEY and
// SEMRUSH_API_KEY on the server side.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/semrush";

interface ProxyPayload {
  // e.g. "domains/domain_ranks" or "user/limits"
  path: string;
  query?: Record<string, string | number | undefined>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SEMRUSH_API_KEY = Deno.env.get("SEMRUSH_API_KEY");

  if (!LOVABLE_API_KEY) {
    return json({ error: "LOVABLE_API_KEY is not configured" }, 500);
  }
  if (!SEMRUSH_API_KEY) {
    return json({ error: "SEMRUSH_API_KEY is not configured" }, 500);
  }

  let payload: ProxyPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const cleanPath = (payload.path || "").replace(/^\/+/, "");
  if (!cleanPath) {
    return json({ error: "Missing 'path'" }, 400);
  }

  const url = new URL(`${GATEWAY_BASE}/${cleanPath}`);
  if (payload.query) {
    for (const [k, v] of Object.entries(payload.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SEMRUSH_API_KEY,
        "Allow-Limit-Offset": "true",
      },
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return json(
        { error: "Semrush gateway error", status: res.status, details: data },
        res.status,
      );
    }

    return json(data, 200);
  } catch (e) {
    console.error("[semrush-proxy]", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}