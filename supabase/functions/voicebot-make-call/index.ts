import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_ID = "6a06964fb875327d960f05f0";
const CALL_API_URL = "https://bn-voicebot-system-9ehp.onrender.com/api/voicebot/custom/call_message_public";
const CALL_API_BEARER_TOKEN = "zjqE5tNXw-TYyNG94J9YxyFjofvI5CRe0w2Cv93lPAQ";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, variables, interruptible } = await req.json();

    const callPayload = {
      bot_id: BOT_ID,
      bot_type: "Confirm1",
      tel_number: phone_number,
      variables: variables || {},
      asr: {
        asr_provider: "botnoi-aws-th-noise-classifier-v17c",
        asr_timeout: 5
      },
      interruptible: interruptible || "False",
      vad: {
        false_timeout_sec: "5",
        false_silence_sec: "0.1",
        true_silence_sec: "0.25",
      },
    };

    console.log("Payload:", JSON.stringify(callPayload, null, 2));

    const response = await fetch(CALL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CALL_API_BEARER_TOKEN}`,
      },
      body: JSON.stringify(callPayload),
    });

    const data = await response.json();
    console.log("Voicebot API response:", data);

    if (!response.ok) {
      throw new Error(`Voicebot API error: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error making call:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
