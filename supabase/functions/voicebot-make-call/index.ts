import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_ID = "6a0c3158b875327d960f0936";
const CALL_API_URL = "https://bn-voicebot-system-9ehp.onrender.com/api/voicebot/custom/call_message_public";
const CALL_API_BEARER_TOKEN = "zjqE5tNXw-TYyNG94J9YxyFjofvI5CRe0w2Cv93lPAQ";

const THAI_DIGIT_WORDS: Record<string, string> = {
  "0": "ศูนย์",
  "1": "หนึ่ง",
  "2": "สอง",
  "3": "สาม",
  "4": "สี่",
  "5": "ห้า",
  "6": "หก",
  "7": "เจ็ด",
  "8": "แปด",
  "9": "เก้า",
};

function toThaiDigitSpeech(value: string): string {
  const normalized = value.replace(/\s+/g, "").trim();
  if (!normalized) return value;

  let hasDigit = false;
  const parts: string[] = [];
  for (const ch of normalized) {
    if (THAI_DIGIT_WORDS[ch]) {
      parts.push(THAI_DIGIT_WORDS[ch]);
      hasDigit = true;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      parts.push(ch.toUpperCase());
      continue;
    }
    if (/[-_/]/.test(ch)) continue;
    parts.push(ch);
  }

  return hasDigit ? parts.join(" ") : value;
}

function prepareVoicebotVariables(input: unknown): Record<string, unknown> {
  const vars = input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {};

  const policyNo = vars.policy_no;
  if (policyNo !== undefined && policyNo !== null) {
    const raw = String(policyNo).trim();
    if (raw) {
      vars.policy_no_raw = raw;
      vars.policy_no = toThaiDigitSpeech(raw);
    }
  }

  const date_today = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "buddhist",
  })
    .format(new Date())
    .replace(/(\S+)\s/, "$1 ที่ ");
  vars.date_today = date_today;
  return vars;
}

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
      variables: prepareVoicebotVariables(variables),
      asr: {
        asr_provider: "botnoi-aws-th-noise-classifier-v17c",
        asr_timeout: 5,
      },
      interruptible: interruptible || "False",
      vad: {
        false_timeout_sec: "5",
        false_silence_sec: "0.1",
        true_silence_sec: "0.25",
      },
    };
    console.log(prepareVoicebotVariables(variables));
    console.log("Payload TEST TEST:", JSON.stringify(callPayload, null, 2));

    const response = await fetch(CALL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CALL_API_BEARER_TOKEN}`,
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
