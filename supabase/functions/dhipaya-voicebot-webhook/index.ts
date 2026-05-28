import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    // CRITICAL FIX: Ignore the initiation "Success" message if it's sent to the webhook
    // This message only means the call was requested, not that it's finished.
    if (payload.message && payload.message.includes("Success Create Outbound call")) {
      console.log("Ignoring initiation acknowledgement message in webhook. Waiting for final call result...");
      return new Response(JSON.stringify({ success: true, message: "Initiation acknowledgement ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract fields from payload
    const callId = payload.outbound_id || payload.call_id;
    const status = payload.status; // e.g. "completed"
    const action = payload.action; // e.g. "Confirm", "Decline", ""
    const conversationLog = payload.conversation_log || null;
    const audioUrl = payload.audio_url || null;
    const callDuration = payload.duration || payload.call_duration || null;
    const appointmentDate = payload.appointment_date || null;
    const appointmentTime = payload.appointment_time || null;

    // Extract phone number from audio_url (format: ..._PHONE.wav)
    let phoneNumber = payload.phone_number || null;
    if (!phoneNumber && audioUrl) {
      const match = audioUrl.match(/_(\d+)\.wav$/);
      if (match) phoneNumber = match[1];
    }

    console.log("Extracted:", { callId, status, action, phoneNumber });

    // Note: "hanged_up" payloads are now processed normally and mapped to "hanged_up" status.

    if (!callId && !phoneNumber) {
      return new Response(JSON.stringify({ success: true, message: "No identifiable data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user actually spoke in the conversation
    // A valid pickup should have at least one "User:" entry with real speech
    // "TIMEOUT" markers from ASR indicate the user turn existed but the customer stayed silent.
    const userParts = conversationLog ? conversationLog.split("User:") : [];
    const hasUserSpoken =
      userParts.length > 1 &&
      userParts.some(
        (p, i) =>
          i > 0 &&
          p.trim().length > 0 &&
          !p.toUpperCase().includes("TIMEOUT"),
      );
    const isSilence = userParts.length > 1 && !hasUserSpoken;

    // Map Botnoi status to our internal status
    const rawStatus = (status || "").toLowerCase();
    let mappedStatus = "failed";

    if (["Confirm", "confirm", "yes", "Yes"].includes(action)) {
      mappedStatus = "confirmed";
    } else if (["Decline", "decline", "no", "No"].includes(action)) {
      mappedStatus = "declined";
    } else if (["Unknown", "unknown"].includes(action)) {
      mappedStatus = "no_response";
    } else if (rawStatus === "hanged_up" || rawStatus === "hangup" || rawStatus === "hung_up") {
      mappedStatus = "hanged_up";
    } else if (rawStatus === "completed") {
      // If Botnoi says completed but no one actually spoke, treat it as no_answer (retryable)
      mappedStatus =
        (hasUserSpoken || isSilence)
          ? "completed"
          : "no_answer";
    } else if (rawStatus === "no answer" || rawStatus === "no_answer") {
      mappedStatus = "no_answer";
    } else if (rawStatus === "busy") {
      mappedStatus = "busy";
    } else if (rawStatus === "failed" || rawStatus === "error") {
      mappedStatus = "failed";
    } else if (rawStatus === "rejected") {
      mappedStatus = "rejected";
    } else if (rawStatus === "voicemail") {
      mappedStatus = "voicemail";
    }

    // If timeout/no-answer happened AFTER the bot already asked about callback
    // availability (day/time/convenience), reclassify as "Not Convenient" instead.
    if (mappedStatus === "no_answer" && conversationLog) {
      const botParts = conversationLog.split(/Bot:|Assistant:/i).slice(1);
      const lastBotMsg = (botParts[botParts.length - 1] || "").toLowerCase();
      const allBotText = botParts.join(" ").toLowerCase();
      const callbackKeywords = [
        "convenient", "callback", "call back", "call you back",
        "what day", "what time", "which day", "which time",
        "when would", "when can", "when is", "available",
        "สะดวก", "นัด", "วันไหน", "เวลาไหน", "ติดต่อใหม่", "โทรกลับ",
      ];
      const askedAboutCallback =
        callbackKeywords.some((k) => lastBotMsg.includes(k)) ||
        callbackKeywords.some((k) => allBotText.includes(k));
      if (askedAboutCallback) {
        mappedStatus = "not_convenient";
      }
    }

    const amdHuman = String(payload.last_amd_status || "").toUpperCase() === "HUMAN";
    const pickedUp = hasUserSpoken || isSilence || amdHuman || ["confirmed", "declined", "no_response", "completed"].includes(mappedStatus);
    let finalStatus: string = mappedStatus === "hanged_up" ? "failed" : (pickedUp ? "success" : "failed");

    // Map to English outcome
    const outcomeMap: Record<string, string> = {
      confirmed: "Confirmed",
      declined: "Declined",
      no_response: "No Response",
      no_answer: "No Answer",
      completed: "Completed",
      failed: "Failed",
      busy: "Busy",
      rejected: "Rejected",
      voicemail: "Voicemail",
      hanged_up: "Hangup",
      not_convenient: "Not Convenient",
    };
    const callOutcome = outcomeMap[mappedStatus] || "Unknown";

    // Branch hints from the call initiation (round-tripped via Botnoi)
    const callVariables =
      (payload.variables && typeof payload.variables === "object"
        ? (payload.variables as Record<string, unknown>)
        : {}) as Record<string, unknown>;
    const nextIntent = String(callVariables.next_intent || "").toLowerCase();
    const consentStatusVar = String(callVariables.consent_status || "").toLowerCase();
    const airtableCustomerNumericId =
      callVariables.customer_id != null && callVariables.customer_id !== ""
        ? Number(callVariables.customer_id)
        : null;



    console.log("Mapped:", { mappedStatus, pickedUp, callOutcome });

    // --- AI Categorization (strict status classifier, branch-aware) ---
    let aiCategory: string | null = null;
    const aiResult = await classifyCall(
      payload,
      conversationLog || "",
      LOVABLE_API_KEY,
      { nextIntent, consentStatus: consentStatusVar },
    );
    aiCategory = aiResult.category;
    console.log("AI Classification:", aiResult);

    // --- Side-effects: persist consent changes back to Airtable ---
    if (
      airtableCustomerNumericId != null &&
      Number.isFinite(airtableCustomerNumericId) &&
      (aiCategory === "Consent Granted" || aiCategory === "Consent Refused")
    ) {
      const newConsent = aiCategory === "Consent Granted" ? "Consent Given" : "Consent Denied";
      try {
        await writeAirtableConsent(airtableCustomerNumericId, newConsent);
        console.log("Airtable consent updated:", { airtableCustomerNumericId, newConsent });
      } catch (e) {
        console.error("Failed to update Airtable consent:", e);
      }
    }


    // --- Resolve user_id and workspace_id ---
    let resolvedUserId: string | null = null;
    let resolvedWorkspaceId: string | null = null;

    // Try from existing call_record
    if (callId) {
      const { data: existing } = await supabase
        .from("call_records")
        .select("user_id, workspace_id, phone_number")
        .eq("botnoi_call_id", callId)
        .maybeSingle();
      if (existing) {
        resolvedUserId = existing.user_id;
        resolvedWorkspaceId = existing.workspace_id;
        if (!phoneNumber && existing.phone_number) phoneNumber = existing.phone_number;
      }
    }

    // Try from debtor
    if (!resolvedUserId && phoneNumber) {
      const { data: debtor } = await supabase
        .from("debtors")
        .select("user_id, workspace_id")
        .eq("phone_number", phoneNumber)
        .not("user_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (debtor) {
        resolvedUserId = debtor.user_id;
        resolvedWorkspaceId = debtor.workspace_id;
      }
    }

    // Last resort: first workspace
    if (!resolvedUserId) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, owner_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (ws) {
        resolvedUserId = ws.owner_id;
        resolvedWorkspaceId = ws.id;
      }
    }

    console.log("Resolved owner:", { resolvedUserId, resolvedWorkspaceId, phoneNumber });

    if (!callId && !phoneNumber) {
      console.error("Critical: No callId and no phoneNumber in payload");
      return new Response(JSON.stringify({ success: false, message: "Missing identification fields" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Update or create call_record ---
    let callRecordId: string | null = null;
    if (callId) {
      const { data: record } = await supabase
        .from("call_records")
        .select("id")
        .eq("botnoi_call_id", callId)
        .maybeSingle();

      if (record) {
        callRecordId = record.id;
        const { error: updateError } = await supabase
          .from("call_records")
          .update({
            status: mappedStatus,
            result_data: payload,
            call_duration: callDuration ? Math.round(Number(callDuration)) : null,
            user_id: resolvedUserId,
            workspace_id: resolvedWorkspaceId,
            appointment_date: appointmentDate || null,
            appointment_time: appointmentTime || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);
        
        if (updateError) {
          console.error(`Error updating call record ${record.id}:`, updateError);
        } else {
          console.log("Call record updated successfully:", record.id);
        }

        // --- ALSO update the call_list_items table to reflect in UI ---
        const { error: cliError } = await supabase
          .from("call_list_items")
          .update({
            status: finalStatus,
            call_outcome: callOutcome,
            picked_up: pickedUp,
            notes: JSON.stringify({
              audio_url: audioUrl,
              conversation_log: conversationLog
            })
          })
          .eq("call_record_id", record.id);
        
        if (cliError) console.error("Error updating call_list_items:", cliError);
        else console.log("Call list item updated via record_id");
      }
    }

    // --- Update or create debtor + call_list_items ---
    if (phoneNumber) {
      let debtorId: string | null = null;

      const { data: existingDebtor } = await supabase
        .from("debtors")
        .select("id")
        .eq("phone_number", phoneNumber)
        .limit(1)
        .maybeSingle();

      if (existingDebtor) {
        debtorId = existingDebtor.id;
      } else {
        const { data: newDebtor } = await supabase
          .from("debtors")
          .insert({
            phone_number: phoneNumber,
            status: "active",
            call_outcome: callOutcome,
            call_answered: pickedUp,
            last_contact_at: new Date().toISOString(),
            picked_up_count: pickedUp ? 1 : 0,
            not_picked_up_count: pickedUp ? 0 : 1,
            contact_attempts: 1,
            user_id: resolvedUserId,
            workspace_id: resolvedWorkspaceId,
          })
          .select("id")
          .single();
        debtorId = newDebtor?.id || null;
        console.log("Debtor auto-created:", debtorId);
      }

      // Update call_list_items - prefer finding by call_record_id (most reliable)
      if (resolvedUserId) {
        let recentItem: { id: string } | null = null;

        // Strategy 1: Find by call_record_id (set by process-call-session)
        if (callRecordId) {
          const { data: byRecord } = await supabase
            .from("call_list_items")
            .select("id")
            .eq("call_record_id", callRecordId)
            .maybeSingle();
          if (byRecord) recentItem = byRecord;
        }

        // Strategy 2: Fall back to debtor_id + calling status
        if (!recentItem && debtorId) {
          const { data: byDebtor } = await supabase
            .from("call_list_items")
            .select("id")
            .eq("debtor_id", debtorId)
            .eq("status", "calling")
            .order("called_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (byDebtor) recentItem = byDebtor;
        }

        // Retry logic disabled: failed/no_response calls are marked failed immediately.
        // No pending_retry, no automatic re-call. Manual retry only via the UI.
        finalStatus = mappedStatus === "hanged_up" ? "failed" : (pickedUp ? "success" : "failed");
        const notesData = JSON.stringify({ audio_url: audioUrl, conversation_log: conversationLog });

        if (recentItem) {
          // Fetch current retry_count for this item (used only for attempt numbering)
          const { data: itemData } = await supabase
            .from("call_list_items")
            .select("retry_count")
            .eq("id", recentItem.id)
            .single();
          const currentRetryCount = itemData?.retry_count || 0;

          await supabase
            .from("call_list_items")
            .update({
              status: finalStatus,
              call_outcome: callOutcome,
              picked_up: pickedUp,
              notes: notesData,
              call_record_id: callRecordId,
              ai_category: aiCategory,
              next_retry_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", recentItem.id);
          console.log("Call list item updated:", recentItem.id, "status:", finalStatus);

          // Update existing call_attempt (created at initiation time) instead of inserting new
          const attemptNumber = currentRetryCount + 1;
          const attemptUpdateData = {
            status: finalStatus,
            call_outcome: callOutcome,
            picked_up: pickedUp,
            ai_category: aiCategory,
            conversation_log: conversationLog || null,
            audio_url: audioUrl || null,
            call_duration: callDuration ? Math.round(Number(callDuration)) : null,
            error_reason: mappedStatus === "failed" || mappedStatus === "no_answer" ? payload.error || status : null,
            call_record_id: callRecordId,
          };

          // Try to update an existing "calling" attempt for this item
          const { data: updatedAttempt } = await supabase
            .from("call_attempts")
            .update(attemptUpdateData)
            .eq("call_list_item_id", recentItem.id)
            .eq("status", "calling")
            .select("id")
            .maybeSingle();

          if (updatedAttempt) {
            console.log(`Call attempt updated: ${updatedAttempt.id} (attempt ${attemptNumber})`);
          } else {
            // Fallback: insert if no "calling" attempt found (e.g. manual calls, legacy)
            await supabase.from("call_attempts").insert({
              call_list_item_id: recentItem.id,
              user_id: resolvedUserId,
              attempt_number: attemptNumber,
              ...attemptUpdateData,
            });
            console.log(`Call attempt inserted (fallback) for item ${recentItem.id}, attempt ${attemptNumber}`);
          }
        } else {
          // Do NOT auto-create call_list_items rows from late webhooks.
          // If the item was cleared by the user (Clear All / Clear Pending),
          // re-inserting here causes deleted rows to reappear in the queue.
          console.log("No matching call_list_item found; skipping auto-create to respect user clears.");
        }

        // Deduct tokens: 4 if picked up, 1 if not
        const tokensToDeduct = pickedUp ? 4 : 1;
        await supabase.rpc("deduct_tokens", { p_user_id: resolvedUserId, p_amount: tokensToDeduct });
        console.log(`Deducted ${tokensToDeduct} tokens`);
      }

      // Update debtor stats
      const { data: debtor } = await supabase
        .from("debtors")
        .select("id, picked_up_count, not_picked_up_count, accept_count, reject_count, other_count")
        .eq("phone_number", phoneNumber)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (debtor) {
        const updateData: Record<string, unknown> = {
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          call_outcome: mappedStatus,
          call_answered: pickedUp,
        };

        if (pickedUp) {
          updateData.picked_up_count = (debtor.picked_up_count || 0) + 1;
        } else {
          updateData.not_picked_up_count = (debtor.not_picked_up_count || 0) + 1;
        }

        if (mappedStatus === "confirmed") {
          updateData.accept_count = (debtor.accept_count || 0) + 1;
          updateData.last_response = "accept";
        } else if (mappedStatus === "declined") {
          updateData.reject_count = (debtor.reject_count || 0) + 1;
          updateData.last_response = "reject";
        } else if (mappedStatus === "no_response" || (mappedStatus === "completed" && pickedUp)) {
          updateData.other_count = (debtor.other_count || 0) + 1;
          updateData.last_response = "unknown";
        }

        // Extract callback date from conversation log (LLM-backed)
        const dateCon = await extractCallbackDate(conversationLog, LOVABLE_API_KEY);
        updateData.date_con = dateCon;

        await supabase.from("debtors").update(updateData).eq("id", debtor.id);
        console.log("Debtor stats updated", { date_con: dateCon });
      }
    }

    // Update active session stats only. Automatic next-call trigger is disabled.
    // Calls must only be triggered manually from the UI.
    const { data: activeSessions } = await supabase
      .from("call_sessions")
      .select("*")
      .eq("status", "running")
      .eq("workspace_id", resolvedWorkspaceId)
      .limit(10);

    if (activeSessions?.length) {
      for (const session of activeSessions) {
        const updates: Record<string, any> = {};
        if (finalStatus === "success") {
          updates.completed_calls = (session.completed_calls || 0) + 1;
          if (mappedStatus === "confirmed") {
            updates.confirmed_calls = (session.confirmed_calls || 0) + 1;
          }
        } else if (finalStatus === "failed") {
          updates.failed_calls = (session.failed_calls || 0) + 1;
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from("call_sessions").update(updates).eq("id", session.id);
          // Trigger session processor to handle next calls or completion
          console.log(`Triggering process-call-session for ${session.id}`);
          fetch(`${supabaseUrl}/functions/v1/process-call-session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ session_id: session.id, action: "continue" })
          }).catch(err => console.error("Error triggering session processor:", err));
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Strict call classifier — aligned with src/lib/callStatuses.ts (15-status taxonomy)
// STEP 1: Check json_log status first → Not Reached (no_answer/busy/voicemail/rejected/unreachable)
// STEP 2: Rule-based audio-quality detection → Background Noise
// STEP 3: AI classifies conversation_log into one of the 15 Main/Sub categories,
//         prioritizing the FINAL business outcome over transient behaviors.
type ClassifyResult = {
  status_id: number;
  status_name: string;
  category: string;
  reason: string;
};

// System-level statuses from the telephony layer all collapse to "Not Reached"
// in the new taxonomy (the customer could not actually be contacted).
const SYSTEM_STATUS_MAP: Record<string, { name: string; thai: string }> = {
  no_answer:   { name: "Not Reached", thai: "ลูกค้าไม่รับสาย" },
  "no answer": { name: "Not Reached", thai: "ลูกค้าไม่รับสาย" },
  unreachable: { name: "Not Reached", thai: "ติดต่อไม่ได้" },
  rejected:    { name: "Not Reached", thai: "ลูกค้าตัดสาย" },
  busy:        { name: "Not Reached", thai: "ลูกค้าสายไม่ว่าง" },
  voicemail:   { name: "Not Reached", thai: "เข้าสู่ระบบฝากข้อความ" },
  failed:      { name: "Not Reached", thai: "โทรไม่สำเร็จ" },
};

// 15-status taxonomy — must stay in sync with MAIN_STATUSES + SUB_STATUSES
// in src/lib/callStatuses.ts. The `name` field is what gets persisted into
// call_list_items.ai_category and consumed by the Analytics dashboard.
const CONVERSATION_CATEGORIES: { id: number; name: string; thai: string; group: "main" | "sub" }[] = [
  // --- Main outcomes ---
  { id: 1,  name: "Planned More Than 3",   thai: "วางแผนชำระเกิน 3 วัน",        group: "main" },
  { id: 2,  name: "Promised to Pay",       thai: "รับปากชำระ",                group: "main" },
  { id: 3,  name: "Restructure Requested", thai: "ขอปรับโครงสร้างหนี้",        group: "main" },
  { id: 4,  name: "Inconvenient (With Date)",    thai: "ไม่สะดวก (มีนัดหมาย)",      group: "main" },
  { id: 16, name: "Inconvenient (Without Date)", thai: "ไม่สะดวก (ไม่มีนัดหมาย)",    group: "main" },
  { id: 5,  name: "Already Paid",          thai: "ชำระเรียบร้อยแล้ว",          group: "main" },
  { id: 6,  name: "Not Reached",           thai: "ติดต่อไม่ได้",               group: "main" },
  { id: 7,  name: "Refused",               thai: "ปฏิเสธ",                   group: "main" },
  // --- Dhipaya consent / PDPA / renewal outcomes ---
  { id: 17, name: "Consent Granted",       thai: "ให้ความยินยอม PDPA",         group: "main" },
  { id: 18, name: "Consent Refused",       thai: "ปฏิเสธความยินยอม PDPA",      group: "main" },
  { id: 19, name: "Recording Refused",     thai: "ปฏิเสธการบันทึกเสียง",        group: "main" },
  { id: 20, name: "Transfer Requested",    thai: "ขอโอนสายให้เจ้าหน้าที่",      group: "main" },
  { id: 21, name: "Renewal Not Convenient", thai: "ไม่สะดวกต่ออายุกรมธรรม์",    group: "main" },
  // --- Conversation behaviors ---
  { id: 8,  name: "Not Convenient",        thai: "ไม่สะดวกคุย",                group: "sub"  },
  { id: 9,  name: "Wrong Person",          thai: "ไม่ใช่ผู้เอาประกัน",          group: "sub"  },
  { id: 10, name: "Call Later",            thai: "นัดหมายให้ติดต่อใหม่",        group: "sub"  },
  { id: 11, name: "Transfer",              thai: "ขอคุยกับเจ้าหน้าที่",         group: "sub"  },
  { id: 12, name: "Background Noise",      thai: "เสียงแทรก/เสียงรบกวน",       group: "sub"  },
  { id: 13, name: "Silence",               thai: "ลูกค้าเงียบ",                group: "sub"  },
  { id: 14, name: "Dropped Call",          thai: "สายหลุดระหว่างสนทนา",        group: "sub"  },
  { id: 15, name: "Out of Topic",          thai: "พูดเรื่องอื่น",              group: "sub"  },
];


// Rule-based audio-quality keywords → forces "Background Noise" before AI runs.
const AUDIO_QUALITY_PATTERNS: RegExp[] = [
  /can'?t hear/i,
  /cannot hear/i,
  /hard to hear/i,
  /loud noise/i,
  /too noisy/i,
  /background noise/i,
  /unclear audio/i,
  /audio (is )?unclear/i,
  /breaking up/i,
  /ไม่ได้ยิน/,
  /เสียงไม่ชัด/,
  /เสียงดัง/,
  /เสียงรบกวน/,
  /เสียงแทรก/,
];

function detectAudioQualityIssue(log: string): boolean {
  return AUDIO_QUALITY_PATTERNS.some((re) => re.test(log));
}

function makeResult(name: string, reason: string): ClassifyResult {
  const cat = CONVERSATION_CATEGORIES.find((c) => c.name === name)!;
  return { status_id: cat.id, status_name: cat.name, category: cat.name, reason };
}

async function classifyCall(
  payload: Record<string, unknown>,
  log: string,
  apiKey: string | undefined,
  branch?: { nextIntent?: string; consentStatus?: string },
): Promise<ClassifyResult> {

  // STEP 1: System-level status check (telephony layer)
  const rawStatus = String(payload.status || "").toLowerCase().trim();
  const sys = SYSTEM_STATUS_MAP[rawStatus];
  if (sys) {
    return makeResult(sys.name, `System status: ${rawStatus} → ${sys.thai}`);
  }

  // STEP 2: No / empty conversation → Not Reached
  if (!log || log.trim().length < 5) {
    return makeResult("Not Reached", "No conversation log present");
  }

  // STEP 3: Rule-based silence detection — customer picked up but never spoke (all User turns are TIMEOUT/empty)
  const userTurns = log.split("User:").slice(1);
  const hasRealSpeech = userTurns.some((t) => {
    const text = t.trim().toUpperCase();
    return text.length > 0 && !text.includes("TIMEOUT");
  });
  if (userTurns.length > 0 && !hasRealSpeech) {
    return makeResult("Silence", "Customer picked up but remained silent (ASR TIMEOUT)");
  }

  // STEP 4: Rule-based audio-quality detection (runs before AI)
  if (detectAudioQualityIssue(log)) {
    return makeResult("Background Noise", "Detected audio-quality keywords in transcript");
  }

  if (!apiKey) {
    console.warn("LOVABLE_API_KEY not found, defaulting to Not Reached");
    return makeResult("Not Reached", "AI key missing");
  }

  const categoryList = CONVERSATION_CATEGORIES.map(
    (c) => `${c.id}. ${c.name} (${c.thai}) [${c.group}]`,
  ).join("\n");

  const systemPrompt = `You classify Thai debt-collection call transcripts. Return STRICT JSON only.
Choose exactly ONE category (use the EXACT English label) from this list:
${categoryList}

CATEGORY DEFINITIONS

Main Outcomes (business result of the call — ALWAYS PREFER THESE):
- Planned More Than 3     → Customer indicates a payment plan / will pay, but the agreed date is MORE THAN 3 days from the call date (e.g. "อาทิตย์หน้า", "เกิน 3 วัน", "เดือนหน้า", "อีก 5 วัน", or any specific date > 3 days away). Also use for vague acknowledgement of the debt with no clear near-term commitment.
- Promised to Pay        → Customer explicitly confirms payment WITHIN 3 days from the call date (today, tomorrow, "พรุ่งนี้", "มะรืน", "อีก 2 วัน", or any specific date ≤ 3 days away).
- Restructure Requested  → Customer asks for debt restructuring, installment plans, payment negotiation, partial payment, deferral, or settlement discussion.
- Inconvenient (With Date)    → Customer says it is not convenient right now BUT provides a specific callback date/time (e.g. "call me back tomorrow at 3pm", "next Monday morning"). A concrete schedule is agreed.
- Inconvenient (Without Date) → Customer says it is not convenient and does NOT provide any specific callback date/time (vague "call me later", "not now", "I'm busy").
- Already Paid           → Customer states the payment has already been completed/settled.
- Not Reached            → Customer could not actually be contacted (no answer, line dead, voicemail, unreachable, hung up before any meaningful exchange).
- Refused                → Customer clearly refuses to pay, denies the debt outright, or terminates the conversation in clear refusal.

Conversation Behaviors (use ONLY when no clear business outcome above exists):
- Not Convenient   → Customer says it is not a convenient time but did not commit to a callback time.
- Wrong Person     → Customer says this is not the policyholder / wrong number.
- Call Later       → Customer vaguely asks to be called another time without a fixed schedule.
- Transfer         → Customer asks to speak to a human agent / staff.
- Background Noise → Audio quality issues, loud background, customer cannot hear clearly, transcript dominated by noise.
- Silence          → Customer remained silent throughout / no verbal response.
- Dropped Call     → Call disconnected with no meaningful customer interaction (pure cutoff).
- Out of Topic     → Customer kept talking about unrelated topics with no resolution.

CRITICAL CLASSIFICATION RULES

1. MANDATORY DEBT DISCLOSURE CHECK (HIGHEST PRIORITY):
   Before classifying as ANY payment outcome ("Promised to Pay" or "Planned More Than 3"), you MUST verify in the conversation_log that the Bot has already DISCLOSED the "Debt Details" to the customer (e.g. license plate, installment number, outstanding balance, due date).
   - If the Bot has NOT yet disclosed these details, it is IMPOSSIBLE for the interaction to be a payment outcome. You MUST NOT choose "Promised to Pay" or "Planned More Than 3" under any circumstance.

2. HANDLING "NOT CONVENIENT" & CALLBACK REQUESTS:
   If the customer indicates they are "not convenient" (ไม่สะดวก), "busy" (ไม่ว่าง), or asks for a callback / to reschedule / to postpone:
   - If the customer specifies a date/time (e.g. "พรุ่งนี้"/"tomorrow", "อาทิตย์หน้า"/"next week", "เดือนหน้า"/"next month", a specific clock time or date) → classify STRICTLY as "Inconvenient (With Date)".
   - If no specific date/time is mentioned → classify as "Inconvenient (Without Date)".
   - STRICT RULE: As long as the debt details have NOT been disclosed, ANY customer request to reschedule or postpone the conversation MUST be classified as "Inconvenient" (With or Without Date), EVEN IF they mention future dates like "tomorrow" or "next week". Never interpret such date mentions as a payment commitment.

3. PAYMENT CLASSIFICATION (ONLY AFTER DISCLOSURE):
   "Promised to Pay" and "Planned More Than 3" are permitted ONLY if BOTH conditions are true:
   (a) The Bot has disclosed the debt details in the conversation_log, AND
   (b) The customer then provides a clear payment commitment tied to that disclosed debt.
   Then decide:
   - "Promised to Pay"     → commitment is within ≤ 3 days from the call date (inclusive of exactly 3 days).
   - "Planned More Than 3" → commitment is STRICTLY > 3 days from the call date (i.e. 4 or more days).
   If the customer states a Buddhist Era year (พ.ศ., > 2400), subtract 543 before comparing.

   3-DAY BOUNDARY RULE (STRICT):
   The following Thai phrasings MUST be treated as ≤ 3 days and classified as "Promised to Pay" (assuming debt details were disclosed and a commitment was made). They MUST NEVER be classified as "Planned More Than 3":
   - "อีก 3 วัน"
   - "3 วัน"
   - "ภายใน 3 วัน"
   - "ไม่เกิน 3 วัน"
   - any equivalent phrasing meaning "within / no more than / up to 3 days"
   Only choose "Planned More Than 3" when the customer explicitly commits to a date that is 4 or more days after the call date (e.g. "อีก 5 วัน", "อาทิตย์หน้า", "สิ้นเดือน", a specific date > 3 days out).

4. CLASSIFICATION LOGIC SUMMARY:
   - IF (Debt details NOT disclosed) → MUST be "Inconvenient (With Date)" or "Inconvenient (Without Date)" (regardless of any time/date mentioned), or another non-payment category if more appropriate (e.g. Wrong Person, Refused, Not Reached).
   - IF (Debt details disclosed AND payment committed) → "Promised to Pay" (≤ 3 days, inclusive) or "Planned More Than 3" (> 3 days, i.e. ≥ 4 days).

5. ADDITIONAL GUIDELINES:
   - Conversation Behavior categories should ONLY be chosen when no clear business outcome above applies.
   - Decide based on the FINAL state of the call, not transient mid-call events.
   - "Refused" requires a clear refusal — not mere reluctance or "not convenient".


Output format (STRICT JSON, no markdown, no commentary):
{
  "status_name": "<exact English label from the list>",
  "confidence": <number between 0 and 1>,
  "reason": "<short explanation focused on the FINAL outcome>"
}

DHIPAYA CONSENT / PDPA / RENEWAL BRANCHES — STRICT PRIORITY OVER GENERIC OUTCOMES

Branch context for THIS call:
- next_intent   = ${branch?.nextIntent || "(unspecified)"}
- consent_status = ${branch?.consentStatus || "(unspecified)"}

Branch A — next_intent = "consent_request" (Consent Needed flow):
  Bot greets the customer by name and asks for PDPA consent.
  - If the customer agrees (e.g. "ยินยอม", "ตกลง", "ให้ความยินยอม", "ok", "agree", "yes I agree") → "Consent Granted".
  - If the customer refuses (e.g. "ไม่ยินยอม", "ไม่ตกลง", "ปฏิเสธ", "no", "do not agree", "ไม่ขอ") → "Consent Refused".
  - Wrong person / not convenient / silence → use the matching behavior category. Never choose "Promised to Pay" / "Planned More Than 3" / "Already Paid" / "Refused" in this branch.

Branch B — next_intent = "pdpa_then_renewal" (or "campaign2" / "campaign3" — Consent Obtained flow):
  Bot first delivers a PDPA recording-disclosure ("we are recording this call, ok?"), then if accepted moves on to a Fire Insurance Renewal pitch and asks if it is convenient.
  - If the customer refuses the recording disclosure (e.g. "ไม่ยินยอมให้บันทึก", "ไม่อนุญาตให้บันทึก", "do not record", "no recording") → "Recording Refused".
  - If the customer accepts the recording AND then asks to speak to a human / transfer / wants to renew via an agent ("สะดวก", "convenient", "โอนสาย", "ขอคุยกับเจ้าหน้าที่", "transfer me") → "Transfer Requested".
  - If the customer accepts the recording but declines the renewal as "not convenient" ("ไม่สะดวก", "not convenient", "ไม่สะดวกต่ออายุ", "ขอไม่ต่อ") → "Renewal Not Convenient".
  - Promised to Pay / Planned More Than 3 / Already Paid / Refused remain valid IFF the renewal/debt details were disclosed and the customer committed accordingly.

PRIORITY RULE: When the branch above clearly applies based on the bot's prompts and the customer's reply, prefer the branch-specific category over a generic one (e.g. prefer "Transfer Requested" over "Transfer"; prefer "Renewal Not Convenient" over "Not Convenient" or "Inconvenient (Without Date)"; prefer "Consent Granted/Refused" over "Refused").`;


  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `conversation_log:\n"""${log}"""` },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status, await response.text());
      return makeResult("Not Reached", "AI request failed");
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const aiName: string = parsed?.status_name || parsed?.chart_update?.category || "";
    const normalized = String(aiName).trim().toLowerCase();
    // Map legacy "Acknowledged" responses from older prompts to the new bucket.
    const aliased =
      normalized === "acknowledged" || normalized === "acknowledge"
        ? "planned more than 3"
        : normalized;
    const match = CONVERSATION_CATEGORIES.find(
      (c) => c.name.toLowerCase() === aliased,
    );

    if (match) {
      return {
        status_id: match.id,
        status_name: match.name,
        category: match.name,
        reason: parsed?.reason || "AI classification",
      };
    }

    console.warn("Unmatched AI category, defaulting to Planned More Than 3:", aiName);
    return makeResult("Planned More Than 3", `Unmatched AI category: ${aiName}`);
  } catch (err) {
    console.error("AI classification error:", err);
    return makeResult("Planned More Than 3", "Classifier exception");
  }
}

// ============================================================================
// CALLBACK DATE EXTRACTION
// Extract a future callback date from the customer's words, relative to the
// timestamp recorded in the conversation log. Returns ISO YYYY-MM-DD or null.
// ============================================================================

function parseLogReferenceDate(log: string): Date {
  // Lines look like: "2026-05-21 17:09:16 Bot: ..."
  const m = log.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    // Treat as Asia/Bangkok local time → UTC equivalent
    const utcMs = Date.UTC(+y, +mo - 1, +d, +h - 7, +mi, +s);
    const dt = new Date(utcMs);
    if (!isNaN(dt.getTime())) return dt;
  }
  return new Date();
}

function bangkokIsoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA → YYYY-MM-DD
}

async function extractCallbackDate(
  conversationLog: string | null,
  apiKey: string | undefined,
): Promise<string | null> {
  if (!conversationLog || conversationLog.trim().length < 5) return null;
  if (!apiKey) return null;

  const referenceDate = parseLogReferenceDate(conversationLog);
  const refIso = bangkokIsoDate(referenceDate);

  const systemPrompt = `You extract a callback date from a Thai debt-collection call transcript.

Reference (call) date in Asia/Bangkok timezone: ${refIso}

Rules (apply relative to the reference date):
- Exact date stated by the customer → return it. If the customer states a Buddhist Era year (พ.ศ., > 2400), subtract 543 to get the Gregorian year.
- "พรุ่งนี้" → reference date + 1 day
- "มะรืน" / "มะรืนนี้" → reference date + 2 days
- "อีก X วัน" → reference date + X days
- "สัปดาห์หน้า" / "อาทิตย์หน้า" → reference date + 7 days
- "เดือนหน้า" → reference date + 30 days
- If multiple dates are mentioned, use the LAST date the customer agreed to.
- If no callback date / time is mentioned, or only the bot suggested one without customer confirmation → null.

Return STRICT JSON only:
{ "date_con": "YYYY-MM-DD" | null }`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `conversation_log:\n"""${conversationLog}"""` },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.warn("extractCallbackDate AI error:", response.status, await response.text());
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const value = parsed?.date_con;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return null;
  } catch (err) {
    console.error("extractCallbackDate exception:", err);
    return null;
  }
}

// ============================================================================
// AIRTABLE CONSENT WRITE-BACK
// Updates (or creates) the linked Consents row for a Dhipaya customer when the
// classifier resolves the call to "Consent Granted" or "Consent Refused".
// Uses the AIRTABLE_PAT secret directly — does NOT go through dhipaya-airtable
// because that proxy requires an end-user JWT, which the webhook does not have.
// ============================================================================
async function writeAirtableConsent(customerNumericId: number, consentStatus: string): Promise<void> {
  const pat = Deno.env.get("AIRTABLE_PAT");
  const baseId = Deno.env.get("AIRTABLE_BASE_ID");
  if (!pat || !baseId) {
    throw new Error("AIRTABLE_PAT or AIRTABLE_BASE_ID not configured");
  }
  const headers = {
    Authorization: `Bearer ${pat}`,
    "Content-Type": "application/json",
  };
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Consents")}`;

  // Look up existing Consents row by Customer link (numeric Customer_ID).
  const formula = encodeURIComponent(`{Customer} = ${customerNumericId}`);
  const listRes = await fetch(`${baseUrl}?filterByFormula=${formula}&maxRecords=1`, { headers });
  if (!listRes.ok) {
    throw new Error(`Airtable list failed: ${listRes.status} ${await listRes.text()}`);
  }
  const listData = await listRes.json();
  const existing = listData.records?.[0];

  const fields: Record<string, unknown> = { Consent_Status: consentStatus };

  if (existing) {
    const patchRes = await fetch(`${baseUrl}/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });
    if (!patchRes.ok) {
      throw new Error(`Airtable patch failed: ${patchRes.status} ${await patchRes.text()}`);
    }
  } else {
    const createRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields: { ...fields, Customer: customerNumericId } }),
    });
    if (!createRes.ok) {
      throw new Error(`Airtable create failed: ${createRes.status} ${await createRes.text()}`);
    }
  }
}


