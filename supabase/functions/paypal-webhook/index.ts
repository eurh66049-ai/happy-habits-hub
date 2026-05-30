// PayPal Webhook — verifies signature with PayPal then marks subscription as verified.
// Public endpoint (verify_jwt = false). Security: PayPal signature verification is mandatory.
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, paypal-transmission-id, paypal-transmission-time, paypal-transmission-sig, paypal-cert-url, paypal-auth-algo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYPAL_ENV = (Deno.env.get("PAYPAL_ENV") || "live").toLowerCase();
const PAYPAL_API = PAYPAL_ENV === "sandbox"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function getAccessToken(): Promise<string> {
  const id = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function verifySignature(headers: Headers, rawBody: string): Promise<boolean> {
  const token = await getAccessToken();
  const verifyBody = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: Deno.env.get("PAYPAL_WEBHOOK_ID"),
    webhook_event: JSON.parse(rawBody),
  };
  const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(verifyBody),
  });
  if (!res.ok) {
    console.error("verify-webhook-signature failed:", res.status, await res.text());
    return false;
  }
  const data = await res.json();
  return data.verification_status === "SUCCESS";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();

  // 1. Verify signature
  const ok = await verifySignature(req.headers, rawBody).catch((e) => {
    console.error("verify error:", e);
    return false;
  });
  if (!ok) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Parse event
  let event: any;
  try { event = JSON.parse(rawBody); } catch {
    return new Response("Bad JSON", { status: 400, headers: corsHeaders });
  }

  const eventId: string = event.id;
  const eventType: string = event.event_type;
  const resource = event.resource ?? {};

  console.log(`[paypal-webhook] ${eventType} id=${eventId}`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Idempotency: if we've already processed this event, ack and return.
  {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("paypal_event_id", eventId)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // 3. Handle relevant payment events
  if (
    eventType === "PAYMENT.CAPTURE.COMPLETED" ||
    eventType === "PAYMENT.SALE.COMPLETED" ||
    eventType === "CHECKOUT.ORDER.APPROVED"
  ) {
    // PayPal capture / sale ID
    const captureId: string | undefined = resource.id;

    // Extract amount (varies between capture and sale events)
    const amountRaw =
      resource.amount?.value ??
      resource.amount?.total ??
      resource.purchase_units?.[0]?.amount?.value;
    const amountUsd = amountRaw ? parseFloat(amountRaw) : null;

    // Try to match a pending subscription record we created on /subscription-success
    let matched = false;
    if (captureId) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("paypal_capture_id", captureId)
        .maybeSingle();

      if (sub) {
        await supabase
          .from("subscriptions")
          .update({
            verified: true,
            paypal_event_id: eventId,
            status: "active",
          })
          .eq("id", sub.id);
        matched = true;
        console.log(`[paypal-webhook] verified subscription ${sub.id}`);
      }
    }

    if (!matched) {
      // Unmatched payment — log it for manual reconciliation by inserting
      // a placeholder row with no user_id is not allowed (NOT NULL),
      // so we just log to console here. Admin can reconcile from PayPal.
      console.warn(
        `[paypal-webhook] no matching subscription for capture=${captureId} amount=${amountUsd}`,
      );
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
