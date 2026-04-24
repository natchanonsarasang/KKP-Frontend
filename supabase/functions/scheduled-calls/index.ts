import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DISABLED: All automatic call logic has been turned off.
// Calls must only be triggered manually from the UI.
serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("scheduled-calls is disabled. No automatic calls will be made.");
  return new Response(
    JSON.stringify({ message: "scheduled-calls is disabled", processed: 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
