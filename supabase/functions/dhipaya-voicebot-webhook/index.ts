// Compatibility shim: this endpoint has been merged into `voicebot-webhook`.
// External Botnoi bot configurations may still POST here, so we forward the
// request body to the unified webhook with `?project=dhipaya` so the merged
// handler picks the Dhipaya consent-flow classifier.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const target = `${supabaseUrl}/functions/v1/voicebot-webhook?project=dhipaya`;

    const body = await req.text();
    const headers = new Headers(req.headers);
    headers.set("x-project", "dhipaya");
    // Authenticate the forwarded call with the service role key so the unified
    // handler runs with the same privileges it expects.
    headers.set(
      "Authorization",
      `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
    );

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });

    const respBody = await upstream.text();
    return new Response(respBody, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error: unknown) {
    console.error("dhipaya-voicebot-webhook forwarder error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
