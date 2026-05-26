import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallSession {
  id: string;
  user_id: string;
  workspace_id: string;
  status: string;
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  confirmed_calls: number;
  tokens_used: number;
  settings: {
    maxRetries: number;
    delayBetweenCalls: number;
    concurrentCalls: number;
    businessHoursOnly: boolean;
    businessHoursStart: string;
    businessHoursEnd: string;
    businessDays: number[];
    testMode?: boolean;
    timezoneOffset?: number; // UTC offset in minutes
    interruptible?: boolean;
  };
}

interface Debtor {
  id: string;
  phone_number: string;
  name: string | null;
  due_date: string | null;
  total_debt: number | null;
  variables: Record<string, string> | null;
  is_blocked: boolean;
}

interface Template {
  id: string;
  template_id: string | null;
  org_name: string;
  message: string;
}

// Thai number words for phonetic conversion (digit by digit for license plates)
const thaiNumbers: Record<string, string> = {
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

// Thai consonant phonetic names (split format: กอ|ไก่)
const thaiConsonants: Record<string, string[]> = {
  ก: ["กอ", "ไก่"],
  ข: ["ขอ", "ไข่"],
  ฃ: ["ฃอ", "ขวด"],
  ค: ["คอ", "ควาย"],
  ฅ: ["ฅอ", "คน"],
  ฆ: ["ฆอ", "ระฆัง"],
  ง: ["งอ", "งู"],
  จ: ["จอ", "จาน"],
  ฉ: ["ฉอ", "ฉิ่ง"],
  ช: ["ชอ", "ช้าง"],
  ซ: ["ซอ", "โซ่"],
  ฌ: ["ฌอ", "เฌอ"],
  ญ: ["ยอ", "หญิง"],
  ฎ: ["ดอ", "ชฎา"],
  ฏ: ["ตอ", "ปฏัก"],
  ฐ: ["ถอ", "ฐาน"],
  ฑ: ["ทอ", "มณโฑ"],
  ฒ: ["ทอ", "ผู้เฒ่า"],
  ณ: ["นอ", "เณร"],
  ด: ["ดอ", "เด็ก"],
  ต: ["ตอ", "เต่า"],
  ถ: ["ถอ", "ถุง"],
  ท: ["ทอ", "ทหาร"],
  ธ: ["ทอ", "ธง"],
  น: ["นอ", "หนู"],
  บ: ["บอ", "ใบไม้"],
  ป: ["ปอ", "ปลา"],
  ผ: ["ผอ", "ผึ้ง"],
  ฝ: ["ฝอ", "ฝา"],
  พ: ["พอ", "พาน"],
  ฟ: ["ฟอ", "ฟัน"],
  ภ: ["พอ", "สำเภา"],
  ม: ["มอ", "ม้า"],
  ย: ["ยอ", "ยักษ์"],
  ร: ["รอ", "เรือ"],
  ล: ["ลอ", "ลิง"],
  ว: ["วอ", "แหวน"],
  ศ: ["สอ", "ศาลา"],
  ษ: ["สอ", "ฤๅษี"],
  ส: ["สอ", "เสือ"],
  ห: ["หอ", "หีบ"],
  ฬ: ["ลอ", "จุฬา"],
  อ: ["ออ", "อ่าง"],
  ฮ: ["ฮอ", "นกฮูก"],
};

// Thai position words for currency reading
const thaiPositions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

// Convert number to Thai words (for currency/amounts)
function numberToThaiWords(num: number): string {
  if (num === 0) return "ศูนย์";
  if (num < 0) return "ลบ" + numberToThaiWords(-num);

  let result = "";
  let position = 0;

  while (num > 0) {
    const digit = num % 10;
    num = Math.floor(num / 10);

    if (digit !== 0) {
      let digitWord = thaiNumbers[digit.toString()];

      // Special cases for Thai number reading
      if (position === 0 && digit === 1 && result !== "") {
        digitWord = "เอ็ด"; // 1 at ones place (except standalone)
      } else if (position === 1 && digit === 1) {
        digitWord = ""; // 1 at tens place is silent
      } else if (position === 1 && digit === 2) {
        digitWord = "ยี่"; // 2 at tens place
      }

      result = digitWord + thaiPositions[position] + result;
    }

    position++;

    // Handle millions (reset position after 6)
    if (position === 7) {
      position = 1;
    }
  }

  return result;
}

// Convert license plate or similar strings to Thai phonetic reading
// Example: 6กข2434 -> |หก|กอ|ไก่|ขอ|ไข่|สอง|สี่|สาม|สี่
function toThaiPhonetic(text: string): string {
  const parts: string[] = [];
  for (const char of text) {
    if (thaiNumbers[char]) {
      parts.push(thaiNumbers[char]);
    } else if (thaiConsonants[char]) {
      // Add both parts separately: กอ|ไก่
      parts.push(...thaiConsonants[char]);
    } else if (/[A-Za-z]/.test(char)) {
      // English letters - spell them out
      parts.push(char.toUpperCase());
    } else if (char.trim()) {
      // Keep other non-space characters
      parts.push(char);
    }
  }
  // Join with | separators: |หก|กอ|ไก่|ขอ|ไข่|สอง|สี่|สาม|สี่
  return parts.length > 0 ? `|${parts.join("|")}` : "";
}

// Spell out Thai name phonetically for difficult names
const uncommonChars = new Set(["ฆ", "ฌ", "ฎ", "ฏ", "ฐ", "ฑ", "ฒ", "ณ", "ธ", "ภ", "ศ", "ษ", "ฬ", "ญ"]);
const thaiModifiers = /[\u0E30-\u0E3A\u0E40-\u0E4E\u0E47-\u0E4F]/;

function spellThaiName(name: string): string {
  if (!name || name.trim().length === 0) return name;
  const needsSpelling = [...name].some((c) => uncommonChars.has(c));
  if (!needsSpelling) return name;

  const parts: string[] = [];
  for (const char of name) {
    if (thaiConsonants[char]) {
      parts.push(`${thaiConsonants[char][0]}|${thaiConsonants[char][1]}`);
    } else if (thaiNumbers[char]) {
      parts.push(thaiNumbers[char]);
    } else if (!thaiModifiers.test(char) && char.trim()) {
      parts.push(char);
    } else {
      if (parts.length > 0) {
        parts[parts.length - 1] += char;
      } else {
        parts.push(char);
      }
    }
  }
  return `${name} สะกดว่า ${parts.join(" ")}`;
}

const nameFields = ["name", "ชื่อ", "first_name", "last_name", "นามสกุล", "ชื่อจริง"];

// Convert amount string to Thai words (WITHOUT "บาท" - template already has it)
function amountToThaiWords(amountStr: string): string {
  const num = parseFloat(amountStr.replace(/,/g, ""));
  if (isNaN(num)) return amountStr;
  return numberToThaiWords(Math.floor(num));
}

function toThaiDigitSpeech(value: string): string {
  const normalized = value.replace(/\s+/g, "").trim();
  if (!normalized) return value;

  let hasDigit = false;
  const parts: string[] = [];
  for (const ch of normalized) {
    if (thaiNumbers[ch]) {
      parts.push(thaiNumbers[ch]);
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

function prepareVoicebotVariables(input: Record<string, string> | null | undefined): Record<string, string> {
  const vars: Record<string, string> = { ...(input || {}) };
  const policyNo = vars.policy_no;
  if (policyNo) {
    const raw = String(policyNo).trim();
    if (raw) {
      vars.policy_no_raw = raw;
      vars.policy_no = toThaiDigitSpeech(raw);
    }
  }
  vars.date_today = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "buddhist",
  })
    .format(new Date())
    .replace(/(\S+)\s/, "$1 ที่ ");
  return vars;
}

function isWithinBusinessHours(settings: CallSession["settings"]): boolean {
  // Skip business hours check in test mode
  if (settings.testMode) {
    console.log("Test mode enabled - skipping business hours check");
    return true;
  }

  if (!settings.businessHoursOnly) return true;

  // Get current UTC time and apply user's timezone offset
  const now = new Date();
  const timezoneOffset = settings.timezoneOffset || 0; // Default to UTC if not set
  const localTime = new Date(now.getTime() + timezoneOffset * 60 * 1000);

  const currentDay = localTime.getUTCDay();

  if (!settings.businessDays?.includes(currentDay)) {
    console.log(`Day ${currentDay} not in business days:`, settings.businessDays);
    return false;
  }

  const hours = localTime.getUTCHours();
  const minutes = localTime.getUTCMinutes();
  const currentTime = hours * 60 + minutes;

  const [startHour, startMin] = (settings.businessHoursStart || "09:00").split(":").map(Number);
  const [endHour, endMin] = (settings.businessHoursEnd || "18:00").split(":").map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  console.log(
    `Business hours check: local time ${hours}:${minutes} (${currentTime} mins), range ${startTime}-${endTime}, offset ${timezoneOffset}`,
  );

  return currentTime >= startTime && currentTime <= endTime;
}

// deno-lint-ignore no-explicit-any
async function processSession(supabase: any, sessionId: string) {
  console.log(`[Session ${sessionId}] Starting processing...`);

  // Get session
  const { data: session, error: sessionError } = await supabase
    .from("call_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    console.error(`[Session ${sessionId}] Error fetching session:`, sessionError);
    return;
  }

  const typedSession = session as CallSession;

  // Check if session should continue
  if (typedSession.status !== "running") {
    console.log(`[Session ${sessionId}] Session status is ${typedSession.status}, stopping.`);
    return;
  }

  // Check business hours
  if (!isWithinBusinessHours(typedSession.settings)) {
    console.log(`[Session ${sessionId}] Outside business hours, pausing.`);
    await supabase
      .from("call_sessions")
      .update({ status: "paused", error_message: "Paused: Outside business hours" })
      .eq("id", sessionId);
    return;
  }

  // Check how many items are currently in "calling" status
  const { data: callingItems, error: callingError } = await supabase
    .from("call_list_items")
    .select("id, called_at")
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .eq("status", "calling");

  // Auto-reset stale "calling" items (stuck for more than 5 minutes)
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const staleItems = (callingItems || []).filter((item: any) => {
    if (!item.called_at) return true; // No timestamp = definitely stale
    return now - new Date(item.called_at).getTime() > STALE_THRESHOLD_MS;
  });

  if (staleItems.length > 0) {
    const staleIds = staleItems.map((item: any) => item.id);
    console.log(`[Session ${sessionId}] Resetting ${staleIds.length} stale "calling" items to "failed"`);
    await supabase
      .from("call_list_items")
      .update({ status: "failed", call_outcome: "Call timed out", picked_up: false })
      .in("id", staleIds);

    // Update corresponding call_attempts that are still in "calling" status
    for (const staleId of staleIds) {
      await supabase
        .from("call_attempts")
        .update({
          status: "failed",
          call_outcome: "Call timed out",
          picked_up: false,
          error_reason: "Stale timeout (5 min)",
        })
        .eq("call_list_item_id", staleId)
        .eq("status", "calling");
    }
  }

  const activeCallingCount = (callingItems?.length || 0) - staleItems.length;
  const maxConcurrent = typedSession.settings.concurrentCalls || 5;
  const availableSlots = Math.max(0, maxConcurrent - activeCallingCount);

  console.log(
    `[Session ${sessionId}] Currently calling: ${activeCallingCount}, max: ${maxConcurrent}, available slots: ${availableSlots}`,
  );

  if (availableSlots === 0) {
    console.log(`[Session ${sessionId}] No available slots, waiting for webhook to trigger next call...`);
    // Don't wait - webhook will trigger us when a call completes
    return;
  }

  // Get pending call list items - only up to available slots
  // For pending_retry/retry_pending items, only pick them up after next_retry_at has passed (1 min delay)
  const nowIso = new Date().toISOString();
  const { data: pendingItems, error: itemsError } = await supabase
    .from("call_list_items")
    .select("*")
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .or(
      `status.eq.pending,and(status.in.(pending_retry,retry_pending),or(next_retry_at.is.null,next_retry_at.lte.${nowIso}))`,
    )
    .limit(availableSlots);

  if (itemsError) {
    console.error(`[Session ${sessionId}] Error fetching items:`, itemsError);
    return;
  }

  if (!pendingItems || pendingItems.length === 0) {
    // Before completing, check if there are pending_retry items waiting for their delay window
    const { count: waitingRetries } = await supabase
      .from("call_list_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", typedSession.workspace_id)
      .eq("user_id", typedSession.user_id)
      .in("status", ["pending_retry", "retry_pending"])
      .gt("next_retry_at", nowIso);

    if (waitingRetries && waitingRetries > 0) {
      console.log(
        `[Session ${sessionId}] No items ready now, but ${waitingRetries} retry(ies) waiting for 1-min delay. Keeping session running.`,
      );
      return;
    }

    console.log(`[Session ${sessionId}] No pending items, completing session.`);
    await supabase
      .from("call_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    return;
  }

  console.log(`[Session ${sessionId}] Processing ${pendingItems.length} items...`);

  // Get debtors for these items
  const debtorIds = pendingItems.map((item: { debtor_id: string }) => item.debtor_id);
  const { data: debtors } = await supabase
    .from("debtors")
    .select("id, phone_number, name, due_date, total_debt, variables, is_blocked")
    .in("id", debtorIds);

  const debtorMap = new Map(((debtors as Debtor[]) || []).map((d) => [d.id, d]));

  // Get templates
  const templateIds = [
    ...new Set(pendingItems.map((item: { template_id: string | null }) => item.template_id).filter(Boolean)),
  ];
  const { data: templates } = await supabase
    .from("call_templates")
    .select("id, template_id, org_name, message")
    .in("id", templateIds);

  const templateMap = new Map(((templates as Template[]) || []).map((t) => [t.id, t]));

  // Get default template
  const { data: defaultTemplates } = await supabase
    .from("call_templates")
    .select("id, template_id, org_name, message")
    .eq("is_system_default", true)
    .limit(1);

  const defaultTemplate = defaultTemplates?.[0] as Template | undefined;

  const isTestMode = typedSession.settings.testMode === true;

  const BOT_ID = "6a0c3158b875327d960f0936";
  const CALL_API_URL = "https://bn-voicebot-system-9ehp.onrender.com/api/voicebot/custom/call_message_public";
  const CALL_API_BEARER_TOKEN = "zjqE5tNXw-TYyNG94J9YxyFjofvI5CRe0w2Cv93lPAQ";
  const BOT_TYPE = "Confirm1";

  if (isTestMode) {
    console.log(`[Session ${sessionId}] 🧪 TEST MODE ENABLED - No real calls will be made`);
  }

  // Mark all items in batch as "calling" first
  const itemIds = pendingItems.map((item: { id: string }) => item.id);
  await supabase
    .from("call_list_items")
    .update({ status: "calling", called_at: new Date().toISOString() })
    .in("id", itemIds);

  console.log(`[Session ${sessionId}] Marked ${itemIds.length} items as 'calling'`);

  // Process items concurrently
  const processItem = async (item: { id: string; debtor_id: string; template_id: string | null }) => {
    const debtor = debtorMap.get(item.debtor_id);
    if (!debtor) {
      console.log(`[Session ${sessionId}] Debtor not found for item ${item.id}`);
      await supabase
        .from("call_list_items")
        .update({ status: "failed", call_outcome: "Debtor not found", picked_up: false })
        .eq("id", item.id);
      return { success: false, failed: true, confirmed: false, tokensUsed: 0 };
    }

    // Skip blocked debtors
    if (debtor.is_blocked) {
      console.log(`[Session ${sessionId}] Debtor ${debtor.phone_number} is blocked, skipping.`);
      await supabase
        .from("call_list_items")
        .update({ status: "completed", call_outcome: "Blocked", picked_up: false })
        .eq("id", item.id);
      return { success: false, failed: false, confirmed: false, tokensUsed: 0 };
    }

    const template = item.template_id ? templateMap.get(item.template_id) : defaultTemplate;
    const vars = prepareVoicebotVariables(debtor.variables);

    console.log(
      `[Session ${sessionId}] Processing call for ${debtor.phone_number} with ${Object.keys(vars).length} variables`,
    );

    try {
      if (isTestMode) {
        // TEST MODE: Simulate call with random outcome
        console.log(`[Session ${sessionId}] 🧪 SIMULATING call to ${debtor.phone_number}...`);

        // Simulate processing time (1-3 seconds)
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

        // Random outcome: 40% confirmed, 20% declined, 20% no_response, 10% other, 10% failed
        const rand = Math.random();
        let mockStatus: string;
        let mockOutcome: string;
        let pickedUp = false;
        let acceptIncrement = 0;
        let rejectIncrement = 0;
        let otherIncrement = 0;

        if (rand < 0.4) {
          mockStatus = "confirmed";
          mockOutcome = "ยืนยันชำระ";
          pickedUp = true;
          acceptIncrement = 1;
        } else if (rand < 0.6) {
          mockStatus = "declined";
          mockOutcome = "ปฏิเสธ";
          pickedUp = true;
          rejectIncrement = 1;
        } else if (rand < 0.8) {
          mockStatus = "no_response";
          mockOutcome = "ไม่ตอบ";
          pickedUp = true;
          otherIncrement = 1;
        } else if (rand < 0.9) {
          mockStatus = "no_answer";
          mockOutcome = "ไม่รับสาย";
          pickedUp = false;
        } else {
          mockStatus = "failed";
          mockOutcome = "โทรไม่สำเร็จ";
          pickedUp = false;
        }

        console.log(`[Session ${sessionId}] 🧪 Mock result for ${debtor.phone_number}: ${mockStatus}`);

        // Create mock call record
        await supabase.from("call_records").insert({
          phone_number: debtor.phone_number,
          template_id: template?.id || null,
          botnoi_call_id: `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          status: mockStatus,
          user_id: typedSession.user_id,
          workspace_id: typedSession.workspace_id,
          result_data: { test_mode: true, simulated: true },
        });

        // Update call list item
        await supabase
          .from("call_list_items")
          .update({
            status: mockStatus,
            call_outcome: mockOutcome,
            picked_up: pickedUp,
          })
          .eq("id", item.id);

        // Update debtor stats - this is critical for filtering
        const debtorUpdate: Record<string, unknown> = {
          contact_attempts: (debtor as unknown as { contact_attempts?: number }).contact_attempts
            ? (debtor as unknown as { contact_attempts: number }).contact_attempts + 1
            : 1,
          last_contact_at: new Date().toISOString(),
          last_response: mockOutcome,
          call_outcome: mockStatus,
          call_answered: pickedUp,
        };

        if (pickedUp) {
          debtorUpdate.picked_up_count = ((debtor as unknown as { picked_up_count?: number }).picked_up_count || 0) + 1;
          debtorUpdate.successful_contacts =
            ((debtor as unknown as { successful_contacts?: number }).successful_contacts || 0) + 1;
        } else {
          debtorUpdate.not_picked_up_count =
            ((debtor as unknown as { not_picked_up_count?: number }).not_picked_up_count || 0) + 1;
        }

        if (acceptIncrement > 0) {
          debtorUpdate.accept_count = ((debtor as unknown as { accept_count?: number }).accept_count || 0) + 1;
        }
        if (rejectIncrement > 0) {
          debtorUpdate.reject_count = ((debtor as unknown as { reject_count?: number }).reject_count || 0) + 1;
        }
        if (otherIncrement > 0) {
          debtorUpdate.other_count = ((debtor as unknown as { other_count?: number }).other_count || 0) + 1;
        }

        await supabase.from("debtors").update(debtorUpdate).eq("id", item.debtor_id);

        console.log(`[Session ${sessionId}] Updated debtor ${item.debtor_id} stats`);

        // Token deduction disabled for testing
        const tokensToDeduct = 0;
        /*
        const { data: currentTokensData } = await supabase
          .from("call_tokens")
          .select("tokens")
          .eq("user_id", typedSession.user_id)
          .single();
        
        if (currentTokensData && currentTokensData.tokens >= tokensToDeduct) {
          await supabase
            .from("call_tokens")
            .update({ 
              tokens: currentTokensData.tokens - tokensToDeduct, 
              updated_at: new Date().toISOString() 
            })
            .eq("user_id", typedSession.user_id);
          console.log(`[Session ${sessionId}] Tokens deducted: ${tokensToDeduct}`);
        }
        */

        return {
          success: mockStatus !== "failed",
          failed: mockStatus === "failed",
          confirmed: mockStatus === "confirmed",
          tokensUsed: tokensToDeduct,
        };
      } else {
        // REAL MODE: Make actual call via flow payload format
        const ASR_PROVIDER = "botnoi-aws-th-noise-classifier-v17c";
        const outboundId = `outbound_${item.id}`;
        const eventId = `event_${sessionId}_${item.id}`;
        const nextIntent = String(vars.next_intent || "{{consent}}").trim();

        const callPayload = {
          outbound_id: outboundId,
          event_id: eventId,
          phonenumber: debtor.phone_number,
          flow:
            "<!outbound_id|<OUTBOUND_REF>!>|||" +
            "<!customer_name|<<customer_name>>!>|||" +
            "<!name|<<name>>!>|||" +
            nextIntent,
          sourcephone: "3525<SOURCE_PHONE_NUMBER>",
          speaker: "212",
          language: "th",
          agent_phone_number: "0800000000",
          speed: "1",
          tts: "voicebot-premium",
          bot_id: BOT_ID,
          bot_type: nextIntent,
          asr_provider: ASR_PROVIDER,
          asr_language_code: "th",
          asr_vad_rules: {
            false_timeout_sec: 1,
            false_silence_sec: 0.1,
            true_silence_sec: 0.25,
          },
          interruptible: typedSession.settings.interruptible ? "True" : "False",
        };

        console.log(`[Session ${sessionId}] Calling ${debtor.phone_number} via Voicebot API...`);
        console.log(`[Session ${sessionId}] Payload:`, JSON.stringify(callPayload));

        const response = await fetch(CALL_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${CALL_API_BEARER_TOKEN}`,
          },
          body: JSON.stringify(callPayload),
        });

        const data = await response.json();
        console.log(`[Session ${sessionId}] Voicebot response:`, JSON.stringify(data));

        // Botnoi API returns success in different ways - check for success indicators
        const isSuccess =
          response.ok &&
          (data.call_id ||
            data.status === "success" ||
            (data.message && data.message.toLowerCase().includes("success")));

        if (isSuccess) {
          // Use outbound_id from Botnoi response (this is what comes back in webhook)
          const botnoiCallId = data.outbound_id || data.call_id || `botnoi_${Date.now()}`;

          // Get current retry_count to determine attempt_number
          const { data: itemData } = await supabase
            .from("call_list_items")
            .select("retry_count")
            .eq("id", item.id)
            .single();
          const currentRetryCount = itemData?.retry_count || 0;
          const attemptNumber = currentRetryCount + 1;

          // Create call record and get its ID
          const { data: callRecord } = await supabase
            .from("call_records")
            .insert({
              phone_number: debtor.phone_number,
              template_id: template?.id || null,
              botnoi_call_id: botnoiCallId,
              status: "pending",
              user_id: typedSession.user_id,
              workspace_id: typedSession.workspace_id,
              result_data: data,
            })
            .select("id")
            .single();

          // Update call list item - keep as "calling" until webhook confirms result
          // Link call_record_id so webhook can find this item reliably
          await supabase
            .from("call_list_items")
            .update({
              status: "calling",
              call_outcome: "Call initiated - awaiting response",
              called_at: new Date().toISOString(),
              call_record_id: callRecord?.id || null,
            })
            .eq("id", item.id);

          // Log call_attempt IMMEDIATELY at initiation time
          // This ensures the attempt is recorded even if the webhook never fires
          await supabase.from("call_attempts").insert({
            call_list_item_id: item.id,
            call_record_id: callRecord?.id || null,
            user_id: typedSession.user_id,
            attempt_number: attemptNumber,
            status: "calling",
            call_outcome: "Call initiated - awaiting response",
            picked_up: false,
          });
          console.log(`[Session ${sessionId}] Call attempt ${attemptNumber} logged for item ${item.id}`);

          // Update debtor contact attempt count
          await supabase
            .from("debtors")
            .update({
              contact_attempts: ((debtor as unknown as { contact_attempts?: number }).contact_attempts || 0) + 1,
              last_contact_at: new Date().toISOString(),
            })
            .eq("id", item.debtor_id);

          // Token deduction disabled for testing
          /*
          const { data: currentTokensData } = await supabase
            .from("call_tokens")
            .select("tokens")
            .eq("user_id", typedSession.user_id)
            .single();
          
          if (currentTokensData && currentTokensData.tokens > 0) {
            await supabase
              .from("call_tokens")
              .update({ 
                tokens: currentTokensData.tokens - 1, 
                updated_at: new Date().toISOString() 
              })
              .eq("user_id", typedSession.user_id);
            console.log(`[Session ${sessionId}] Deducted 1 token for real call initiation`);
          }
          */

          return { success: true, failed: false, confirmed: false, tokensUsed: 0 };
        } else {
          throw new Error(data.message || "Call failed");
        }
      }
    } catch (error) {
      console.error(`[Session ${sessionId}] Error calling ${debtor.phone_number}:`, error);

      await supabase
        .from("call_list_items")
        .update({
          status: "failed",
          call_outcome: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", item.id);

      return { success: false, failed: true, confirmed: false, tokensUsed: 0 };
    }
  };

  // Check if session should stop before processing
  const { data: currentSession } = await supabase.from("call_sessions").select("status").eq("id", sessionId).single();

  if (currentSession?.status === "paused") {
    console.log(`[Session ${sessionId}] Paused by user, stopping processing.`);
    return;
  }

  // Process all items in parallel
  console.log(`[Session ${sessionId}] Processing ${pendingItems.length} items concurrently...`);
  const results = await Promise.all(pendingItems.map(processItem));

  const completedCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => r.failed).length;
  const tokensUsedInBatch = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);

  console.log(
    `[Session ${sessionId}] Batch complete: ${completedCount} completed, ${failedCount} failed, ${tokensUsedInBatch} tokens used`,
  );

  // Update session progress
  await supabase
    .from("call_sessions")
    .update({
      completed_calls: isTestMode ? typedSession.completed_calls + completedCount : undefined,
      failed_calls: isTestMode ? typedSession.failed_calls + failedCount : undefined,
      tokens_used: typedSession.tokens_used + tokensUsedInBatch,
    })
    .eq("id", sessionId);

  if (!isTestMode) {
    console.log(`[Session ${sessionId}] Call initiated. Tokens deducted: ${tokensUsedInBatch}. Waiting for webhook to update stats.`);
  }

  // Check if more items to process and if we have available slots
  // Exclude pending_retry items whose next_retry_at hasn't passed yet (10 min delay)
  const checkNowIso = new Date().toISOString();
  const { count } = await supabase
    .from("call_list_items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .or(
      `status.eq.pending,and(status.in.(pending_retry,retry_pending),or(next_retry_at.is.null,next_retry_at.lte.${checkNowIso}))`,
    );

  // Check current calling count (with stale detection)
  const { data: currentCalling } = await supabase
    .from("call_list_items")
    .select("id, called_at")
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .eq("status", "calling");

  // Reset any stale calls at the end too
  const endNow = Date.now();
  const endStaleItems = (currentCalling || []).filter((item: any) => {
    if (!item.called_at) return true;
    return endNow - new Date(item.called_at).getTime() > STALE_THRESHOLD_MS;
  });

  if (endStaleItems.length > 0) {
    const endStaleIds = endStaleItems.map((item: any) => item.id);
    console.log(`[Session ${sessionId}] End-of-batch: resetting ${endStaleIds.length} stale items`);
    await supabase
      .from("call_list_items")
      .update({ status: "failed", call_outcome: "Call timed out", picked_up: false })
      .in("id", endStaleIds);
  }

  const callingNow = (currentCalling?.length || 0) - endStaleItems.length;
  const slotsAvailable = maxConcurrent - callingNow;

  if (count && count > 0 && slotsAvailable > 0) {
    console.log(`[Session ${sessionId}] ${count} more items, ${slotsAvailable} slots available, continuing...`);
    await processSession(supabase, sessionId);
  } else if (count && count > 0) {
    console.log(`[Session ${sessionId}] ${count} more items but no slots available, waiting for webhook...`);
  } else if (callingNow === 0) {
    // Before completing, double check if there are ANY items waiting for retry delay
    const { count: waitingForRetry } = await supabase
      .from("call_list_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", typedSession.workspace_id)
      .eq("user_id", typedSession.user_id)
      .in("status", ["pending_retry", "retry_pending"])
      .gt("next_retry_at", checkNowIso);

    if (waitingForRetry && waitingForRetry > 0) {
      console.log(`[Session ${sessionId}] No items ready now, but ${waitingForRetry} retries waiting for delay. Keeping session running.`);
      return;
    }

    console.log(`[Session ${sessionId}] All items processed, completing.`);
    await supabase
      .from("call_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  } else {
    console.log(`[Session ${sessionId}] No pending items, ${callingNow} calls still in progress...`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, action } = await req.json();
    console.log("Request:", { session_id, action });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "pause") {
      // Pause the session
      const { error } = await supabase
        .from("call_sessions")
        .update({ status: "paused", error_message: "Paused by user" })
        .eq("id", session_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, message: "Session paused" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "stop") {
      // Stop and terminate the session completely
      const { error } = await supabase
        .from("call_sessions")
        .update({ status: "stopped", completed_at: new Date().toISOString(), error_message: "Stopped by user" })
        .eq("id", session_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, message: "Session stopped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "start" || action === "continue") {
      // Start or continue processing using waitUntil for background execution
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(processSession(supabase, session_id));
      } else {
        // Fallback: run inline (will complete before response for short sessions)
        await processSession(supabase, session_id);
      }

      const message = action === "start" ? "Processing started" : "Processing continued";
      return new Response(JSON.stringify({ success: true, message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
