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
    const { phone_number, template_id, constructed_message } = await req.json();

    const botnoiToken = Deno.env.get("BOTNOI_API_TOKEN");
    if (!botnoiToken) {
      throw new Error("BOTNOI_API_TOKEN not configured");
    }

    console.log("Making call via Botnoi API...");
    console.log("Input:", { phone_number, template_id, constructed_message });

    // Build the call payload - pack the full constructed message into Appointment Date
    const callPayload = {
      outbound_id: "mock-outbound-0001",
      phonenumber: phone_number,
      bot_id: "6a06964fb875327d960f05f0", // ใส่ bot_id ที่คุณต้องการใช้
      flow: constructed_message,
      speaker: "212",
      language: "th",
      tts: "voicebot-premium",
      asr_provider: "botnoi-aws-th-noise-classifier-v17c",
      asr_language_code: "th",
      asr_vad_rules: {
        false_timeout_sec: 1,
        false_silence_sec: 0.1,
        true_silence_sec: 0.25,
      },
      interruptible: "True",
    };

    // Only add Appointment Date if constructed_message is provided
    if (constructed_message) {
      callPayload["Appointment Date"] = constructed_message;
    }

    console.log("Final payload to Botnoi:", JSON.stringify(callPayload, null, 2));

    const response = await fetch("https://api-voice.botnoi.ai/api/voicebot/confirm/call", {
      method: "POST",
      headers: {
        accept: "application/json",
        "botnoi-token": botnoiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(callPayload),
    });

    const data = await response.json();
    console.log("Botnoi API response:", data);

    if (!response.ok) {
      throw new Error(`Botnoi API error: ${JSON.stringify(data)}`);
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
