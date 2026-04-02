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
  'ก': ['กอ', 'ไก่'],
  'ข': ['ขอ', 'ไข่'],
  'ฃ': ['ฃอ', 'ขวด'],
  'ค': ['คอ', 'ควาย'],
  'ฅ': ['ฅอ', 'คน'],
  'ฆ': ['ฆอ', 'ระฆัง'],
  'ง': ['งอ', 'งู'],
  'จ': ['จอ', 'จาน'],
  'ฉ': ['ฉอ', 'ฉิ่ง'],
  'ช': ['ชอ', 'ช้าง'],
  'ซ': ['ซอ', 'โซ่'],
  'ฌ': ['ฌอ', 'เฌอ'],
  'ญ': ['ยอ', 'หญิง'],
  'ฎ': ['ดอ', 'ชฎา'],
  'ฏ': ['ตอ', 'ปฏัก'],
  'ฐ': ['ถอ', 'ฐาน'],
  'ฑ': ['ทอ', 'มณโฑ'],
  'ฒ': ['ทอ', 'ผู้เฒ่า'],
  'ณ': ['นอ', 'เณร'],
  'ด': ['ดอ', 'เด็ก'],
  'ต': ['ตอ', 'เต่า'],
  'ถ': ['ถอ', 'ถุง'],
  'ท': ['ทอ', 'ทหาร'],
  'ธ': ['ทอ', 'ธง'],
  'น': ['นอ', 'หนู'],
  'บ': ['บอ', 'ใบไม้'],
  'ป': ['ปอ', 'ปลา'],
  'ผ': ['ผอ', 'ผึ้ง'],
  'ฝ': ['ฝอ', 'ฝา'],
  'พ': ['พอ', 'พาน'],
  'ฟ': ['ฟอ', 'ฟัน'],
  'ภ': ['พอ', 'สำเภา'],
  'ม': ['มอ', 'ม้า'],
  'ย': ['ยอ', 'ยักษ์'],
  'ร': ['รอ', 'เรือ'],
  'ล': ['ลอ', 'ลิง'],
  'ว': ['วอ', 'แหวน'],
  'ศ': ['สอ', 'ศาลา'],
  'ษ': ['สอ', 'ฤๅษี'],
  'ส': ['สอ', 'เสือ'],
  'ห': ['หอ', 'หีบ'],
  'ฬ': ['ลอ', 'จุฬา'],
  'อ': ['ออ', 'อ่าง'],
  'ฮ': ['ฮอ', 'นกฮูก'],
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
  return parts.length > 0 ? `|${parts.join('|')}` : '';
}

// Spell out Thai name phonetically for difficult names
const uncommonChars = new Set(['ฆ', 'ฌ', 'ฎ', 'ฏ', 'ฐ', 'ฑ', 'ฒ', 'ณ', 'ธ', 'ภ', 'ศ', 'ษ', 'ฬ', 'ญ']);
const thaiModifiers = /[\u0E30-\u0E3A\u0E40-\u0E4E\u0E47-\u0E4F]/;

function spellThaiName(name: string): string {
  if (!name || name.trim().length === 0) return name;
  const needsSpelling = [...name].some(c => uncommonChars.has(c));
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
  return `${name} สะกดว่า ${parts.join(' ')}`;
}

const nameFields = ['name', 'ชื่อ', 'first_name', 'last_name', 'นามสกุล', 'ชื่อจริง'];

// Convert amount string to Thai words (WITHOUT "บาท" - template already has it)
function amountToThaiWords(amountStr: string): string {
  const num = parseFloat(amountStr.replace(/,/g, ""));
  if (isNaN(num)) return amountStr;
  return numberToThaiWords(Math.floor(num));
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

  console.log(`Business hours check: local time ${hours}:${minutes} (${currentTime} mins), range ${startTime}-${endTime}, offset ${timezoneOffset}`);
  
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
    .select("id")
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .eq("status", "calling");

  const currentlyCallingCount = callingItems?.length || 0;
  const maxConcurrent = typedSession.settings.concurrentCalls || 5;
  const availableSlots = Math.max(0, maxConcurrent - currentlyCallingCount);

  console.log(`[Session ${sessionId}] Currently calling: ${currentlyCallingCount}, max: ${maxConcurrent}, available slots: ${availableSlots}`);

  if (availableSlots === 0) {
    console.log(`[Session ${sessionId}] No available slots, waiting for webhook to trigger next call...`);
    // Don't wait - webhook will trigger us when a call completes
    return;
  }

  // Get pending call list items - only up to available slots
  const { data: pendingItems, error: itemsError } = await supabase
    .from("call_list_items")
    .select("*")
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .in("status", ["pending", "retry_pending"])
    .limit(availableSlots);

  if (itemsError) {
    console.error(`[Session ${sessionId}] Error fetching items:`, itemsError);
    return;
  }

  if (!pendingItems || pendingItems.length === 0) {
    console.log(`[Session ${sessionId}] No pending items, completing session.`);
    await supabase
      .from("call_sessions")
      .update({ 
        status: "completed", 
        completed_at: new Date().toISOString() 
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

  const debtorMap = new Map((debtors as Debtor[] || []).map(d => [d.id, d]));

  // Get templates
  const templateIds = [...new Set(pendingItems.map((item: { template_id: string | null }) => item.template_id).filter(Boolean))];
  const { data: templates } = await supabase
    .from("call_templates")
    .select("id, template_id, org_name, message")
    .in("id", templateIds);

  const templateMap = new Map((templates as Template[] || []).map(t => [t.id, t]));

  // Get default template
  const { data: defaultTemplates } = await supabase
    .from("call_templates")
    .select("id, template_id, org_name, message")
    .eq("is_system_default", true)
    .limit(1);

  const defaultTemplate = defaultTemplates?.[0] as Template | undefined;

  const isTestMode = typedSession.settings.testMode === true;
  
  const BOT_ID = "69ccce0db875327d960ef0cf";
  const CALL_API_URL = "https://bn-voicebot-system.onrender.com/api/voicebot/custom/call_message_public";
  
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
      return { success: false, failed: false };
    }

    // Skip blocked debtors
    if (debtor.is_blocked) {
      console.log(`[Session ${sessionId}] Debtor ${debtor.phone_number} is blocked, skipping.`);
      await supabase
        .from("call_list_items")
        .update({ status: "completed", call_outcome: "Blocked", picked_up: false })
        .eq("id", item.id);
      return { success: false, failed: false };
    }

    const template = item.template_id ? templateMap.get(item.template_id) : defaultTemplate;
    const vars = debtor.variables || {};

    console.log(`[Session ${sessionId}] Processing call for ${debtor.phone_number} with ${Object.keys(vars).length} variables`);

    try {
      if (isTestMode) {
        // TEST MODE: Simulate call with random outcome
        console.log(`[Session ${sessionId}] 🧪 SIMULATING call to ${debtor.phone_number}...`);
        
        // Simulate processing time (1-3 seconds)
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        
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
          debtorUpdate.successful_contacts = ((debtor as unknown as { successful_contacts?: number }).successful_contacts || 0) + 1;
        } else {
          debtorUpdate.not_picked_up_count = ((debtor as unknown as { not_picked_up_count?: number }).not_picked_up_count || 0) + 1;
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
        
        await supabase
          .from("debtors")
          .update(debtorUpdate)
          .eq("id", item.debtor_id);
        
        console.log(`[Session ${sessionId}] Updated debtor ${item.debtor_id} stats`);
        
        // Deduct tokens for test mode: 4 if picked up, 1 if not
        const tokensToDeduct = pickedUp ? 4 : 1;
        console.log(`[Session ${sessionId}] Deducting ${tokensToDeduct} tokens for test call (picked_up: ${pickedUp})`);
        
        const { data: deductResult, error: deductError } = await supabase
          .rpc('deduct_tokens', { p_user_id: typedSession.user_id, p_amount: tokensToDeduct });
        
        if (deductError) {
          console.error(`[Session ${sessionId}] Error deducting tokens:`, deductError);
        } else {
          console.log(`[Session ${sessionId}] Token deduction result: ${deductResult}`);
        }
        
        return { success: mockStatus !== "failed", failed: mockStatus === "failed", confirmed: mockStatus === "confirmed", tokensUsed: tokensToDeduct };
      } else {
        // REAL MODE: Make actual call via new Voicebot API
        const vars = debtor.variables || {};
        const callPayload = {
          bot_id: BOT_ID,
          bot_type: "in_init_conversation",
          tel_number: debtor.phone_number,
          variables: vars,
          interruptible: "true",
          asr: { asr_provider: "botnoi-aws-th-noise-classifier-v17c" },
        };

        console.log(`[Session ${sessionId}] Calling ${debtor.phone_number} via Voicebot API...`);
        console.log(`[Session ${sessionId}] Payload:`, JSON.stringify(callPayload));

        const response = await fetch(CALL_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(callPayload),
        });

        const data = await response.json();
        console.log(`[Session ${sessionId}] Voicebot response:`, JSON.stringify(data));

        // Botnoi API returns success in different ways - check for success indicators
        const isSuccess = response.ok && (
          data.call_id || 
          data.status === "success" || 
          (data.message && data.message.toLowerCase().includes("success"))
        );
        
        if (isSuccess) {
          // Use outbound_id from Botnoi response (this is what comes back in webhook)
          const botnoiCallId = data.outbound_id || data.call_id || `botnoi_${Date.now()}`;
          
          // Create call record
          await supabase.from("call_records").insert({
            phone_number: debtor.phone_number,
            template_id: template.id,
            botnoi_call_id: botnoiCallId,
            status: "pending",
            user_id: typedSession.user_id,
            workspace_id: typedSession.workspace_id,
            result_data: data,
          });

          // Update call list item - keep as "calling" until webhook confirms result
          await supabase
            .from("call_list_items")
            .update({ 
              status: "calling", 
              call_outcome: "Call initiated - awaiting response",
              called_at: new Date().toISOString(),
            })
            .eq("id", item.id);
          
          // Update debtor contact attempt count
          await supabase
            .from("debtors")
            .update({
              contact_attempts: ((debtor as unknown as { contact_attempts?: number }).contact_attempts || 0) + 1,
              last_contact_at: new Date().toISOString(),
            })
            .eq("id", item.debtor_id);

          return { success: true, failed: false, confirmed: false, tokensUsed: 0 }; // Tokens deducted in webhook for real calls
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
          call_outcome: error instanceof Error ? error.message : "Unknown error" 
        })
        .eq("id", item.id);

      return { success: false, failed: true, confirmed: false, tokensUsed: 0 };
    }
  };

  // Check if session should stop before processing
  const { data: currentSession } = await supabase
    .from("call_sessions")
    .select("status")
    .eq("id", sessionId)
    .single();

  if (currentSession?.status === "paused") {
    console.log(`[Session ${sessionId}] Paused by user, stopping processing.`);
    return;
  }

  // Process all items in parallel
  console.log(`[Session ${sessionId}] Processing ${pendingItems.length} items concurrently...`);
  const results = await Promise.all(pendingItems.map(processItem));
  
  const completedCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => r.failed).length;
  const tokensUsedInBatch = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  
  console.log(`[Session ${sessionId}] Batch complete: ${completedCount} completed, ${failedCount} failed, ${tokensUsedInBatch} tokens used`);

  // Update session progress (tokens_used only updated for test mode, real mode tokens are deducted in webhook)
  await supabase
    .from("call_sessions")
    .update({
      completed_calls: typedSession.completed_calls + completedCount,
      failed_calls: typedSession.failed_calls + failedCount,
      tokens_used: typedSession.tokens_used + tokensUsedInBatch,
    })
    .eq("id", sessionId);

  // Check if more items to process and if we have available slots
  const { count } = await supabase
    .from("call_list_items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .in("status", ["pending", "retry_pending"]);

  // Check current calling count
  const { data: currentCalling } = await supabase
    .from("call_list_items")
    .select("id")
    .eq("workspace_id", typedSession.workspace_id)
    .eq("user_id", typedSession.user_id)
    .eq("status", "calling");

  const callingNow = currentCalling?.length || 0;
  const slotsAvailable = maxConcurrent - callingNow;

  if (count && count > 0 && slotsAvailable > 0) {
    console.log(`[Session ${sessionId}] ${count} more items, ${slotsAvailable} slots available, continuing...`);
    // Continue processing immediately to fill available slots
    await processSession(supabase, sessionId);
  } else if (count && count > 0) {
    console.log(`[Session ${sessionId}] ${count} more items but no slots available, waiting for webhook...`);
    // Don't recurse - webhook will trigger us when a call completes
  } else if (callingNow === 0) {
    console.log(`[Session ${sessionId}] All items processed, completing.`);
    await supabase
      .from("call_sessions")
      .update({ 
        status: "completed", 
        completed_at: new Date().toISOString() 
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
