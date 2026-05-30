// Returns public PayPal config (client-id + env) so the frontend can load the SDK
// dynamically. Client ID is a public value; safe to expose.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
  const env = (Deno.env.get("PAYPAL_ENV") || "live").toLowerCase();

  return new Response(
    JSON.stringify({ clientId, env, currency: "USD" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
