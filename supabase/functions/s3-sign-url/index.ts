import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 🔒 Require authenticated user. Write mode is admin-only.
    const auth = await verifyAuth(req);
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");

    if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Missing connector secrets",
          details: {
            lovable: !!LOVABLE_API_KEY,
            s3: !!AWS_S3_API_KEY,
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "write" ? "write" : "read";
    const objectPath: string | undefined = body.object_path;

    // 🔒 Write operations require admin privileges
    if (mode === "write" && !auth.isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: write mode is admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    if (!objectPath || typeof objectPath !== "string" || objectPath.length === 0) {
      return new Response(
        JSON.stringify({ error: "object_path is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Basic safety: forbid traversal and absolute keys
    if (objectPath.includes("..") || objectPath.startsWith("/")) {
      return new Response(
        JSON.stringify({ error: "invalid object_path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = `${GATEWAY_BASE}/api/v1/sign_storage_url?provider=aws_s3&mode=${mode}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": AWS_S3_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ object_path: objectPath }),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("Gateway sign_storage_url failed", upstream.status, text);
      return new Response(
        JSON.stringify({
          error: `Gateway error [${upstream.status}]`,
          details: text,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("s3-sign-url error", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});