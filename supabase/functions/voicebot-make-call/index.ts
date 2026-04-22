import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_ID = "69d7214db875327d960ef7ac";
const CALL_API_URL = "https://bn-voicebot-system-9ehp.onrender.com/api/voicebot/custom/call_message_public";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, variables } = await req.json();

    if (!phone_number) {
      throw new Error("phone_number is required");
    }

    console.log("Making call via Voicebot API...");
    console.log("Input:", { phone_number, variables });

    const callPayload = {
      bot_id: BOT_ID,
      bot_type: "Confirm1",
      tel_number: phone_number,
      variables: variables || {},
      interruptible: "True",
      asr: { asr_provider: "botnoi-aws-th-noise-classifier-v17c" },
      vad: {
        false_timeout_sec: "5",
        false_silence_sec: "0.1",
        true_silence_sec: "0.25",
      },
    };

    console.log("Payload:", JSON.stringify(callPayload, null, 2));

    const response = await fetch(CALL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
