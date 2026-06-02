import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Concurrency strategy ------------------------------------------------
// Webhooks process fully in parallel (no mutex queue) to avoid hitting the
// Edge Function global timeout. To respect Airtable's 5 req/sec limit when
// many calls hang up simultaneously, we inject an initial jittered delay
// (0-1500ms) before the first Airtable read. Writes keep the 429-aware
// exponential backoff in airtableFetch.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function initialAirtableJitter() {
  const delay = Math.floor(Math.random() * 1500);
  console.log(`[JITTER] Spacing Airtable lookup by ${delay}ms`);
  await sleep(delay);
}

// Shared formula: strict (phone match) AND CheckCall='Y'
function phoneCheckCallFormula(normalized: string): string {
  return (
    `AND(` +
    `OR(` +
    `REGEX_REPLACE({Phone_Number1}&"",'[^0-9]','')='${normalized}',` +
    `REGEX_REPLACE({Phone_Number2}&"",'[^0-9]','')='${normalized}',` +
    `REGEX_REPLACE({Phone_Number3}&"",'[^0-9]','')='${normalized}'` +
    `),` +
    `UPPER(TRIM({CheckCall}&""))='Y'` +
    `)`
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return await handleWebhook(req);
});

async function handleWebhook(req: Request): Promise<Response> {
  try {
    // Spread parallel webhook fires across ~1.5s before first Airtable read
    await initialAirtableJitter();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const payload = await req.json().catch(() => ({}));
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
    const callId = payload.call_id || payload.outbound_id;
    const status = payload.status; // e.g. "completed"
    const action = payload.action; // e.g. "Confirm", "Decline", ""
    // Normalize conversation_log defensively — webhook may send a string,
    // an array of turn objects ({sayingName, content, ...}), or undefined.
    const rawConversationLog = payload.conversation_log;
    console.log("Received conversationLog type:", typeof rawConversationLog);
    console.log("Received conversationLog value:", rawConversationLog);
    let conversationLog: string | null = null;
    if (typeof rawConversationLog === "string") {
      conversationLog = rawConversationLog;
    } else if (Array.isArray(rawConversationLog)) {
      conversationLog = rawConversationLog
        .map((turn: any) => {
          if (typeof turn === "string") return turn;
          const speaker = turn?.sayingName || turn?.speaker || turn?.role || "";
          const content = turn?.content ?? turn?.text ?? turn?.message ?? "";
          return speaker ? `${speaker}: ${content}` : String(content);
        })
        .join("\n");
    } else if (rawConversationLog != null) {
      try {
        conversationLog = String(rawConversationLog);
      } catch {
        conversationLog = null;
      }
    }
    const audioUrl = payload.audio_url || null;
    const callDuration = payload.duration || payload.call_duration || null;
    const appointmentDate = payload.appointment_date || null;
    const appointmentTime = payload.appointment_time || null;

    // Extract phone number from audio_url (format: ..._PHONE.wav[?query])
    let phoneNumber = payload.phone_number || null;
    if (!phoneNumber && audioUrl) {
      // Strip query string before matching so signed-URL params don't break it
      const pathOnly = String(audioUrl).split("?")[0];
      const match = pathOnly.match(/_(\d+)\.wav$/i);
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
      userParts.some((p, i) => i > 0 && p.trim().length > 0 && !p.toUpperCase().includes("TIMEOUT"));
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
      mappedStatus = hasUserSpoken || isSilence ? "completed" : "no_answer";
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
        "convenient",
        "callback",
        "call back",
        "call you back",
        "what day",
        "what time",
        "which day",
        "which time",
        "when would",
        "when can",
        "when is",
        "available",
        "สะดวก",
        "นัด",
        "วันไหน",
        "เวลาไหน",
        "ติดต่อใหม่",
        "โทรกลับ",
      ];
      const askedAboutCallback =
        callbackKeywords.some((k) => lastBotMsg.includes(k)) || callbackKeywords.some((k) => allBotText.includes(k));
      if (askedAboutCallback) {
        mappedStatus = "not_convenient";
      }
    }

    const amdHuman = String(payload.last_amd_status || "").toUpperCase() === "HUMAN";
    const pickedUp =
      hasUserSpoken ||
      isSilence ||
      amdHuman ||
      ["confirmed", "declined", "no_response", "completed"].includes(mappedStatus);
    let finalStatus: string = mappedStatus === "hanged_up" ? "failed" : pickedUp ? "success" : "failed";

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

    console.log("Mapped:", { mappedStatus, pickedUp, callOutcome });

    // --- AI Categorization (strict status classifier) ---
    let aiCategory: string | null = null;
    const aiResult = await classifyCall(payload, conversationLog || "", LOVABLE_API_KEY);
    aiCategory = aiResult.category;
    console.log("AI Classification:", aiResult);
    // --- STRICT CheckCall='Y' gate (Dhipaya) ---
    // Before performing ANY Airtable write-back (consent, notice, call log),
    // fetch the debtor's row and verify CheckCall === 'Y'. Abort otherwise.
    let checkCallAllowed = false;
    if (phoneNumber) {
      try {
        checkCallAllowed = await isCheckCallAllowed(phoneNumber);
      } catch (e) {
        console.error("CheckCall lookup failed:", e);
        checkCallAllowed = false;
      }
    }
    if (!checkCallAllowed) {
      console.log(
        `[SKIPPED] CheckCall != 'Y' for phone ${phoneNumber ?? "unknown"} — aborting Airtable consent/notice/call-log sync.`,
      );
    }

    // --- Airtable consent sync (Dhipaya) ---
    // Sync whenever the customer was reached (pickedUp) AND the AI independently
    // captured a definitive consent decision. Telephony callOutcome is NOT used
    // to gate this — the consent conversation can complete even when the call
    // technically ends as "Failed"/"Hangup".
    const consentValue: "Consent Given" | "Consent Denied" | null =
      aiResult.consentDecision === "Given"
        ? "Consent Given"
        : aiResult.consentDecision === "Denied"
          ? "Consent Denied"
          : null;
    const consentSyncEnabled = Boolean(phoneNumber && pickedUp && consentValue && checkCallAllowed);
    if (!consentSyncEnabled) {
      console.log("Airtable consent sync skipped:", {
        phoneNumber,
        pickedUp,
        consentDecision: aiResult.consentDecision,
      });
    }

    // --- Sequenced consent -> call log task (avoids race on Consents FK) ---
    const consentThenCallLogTask = (async () => {
      let consentRecordId: string | null = null;
      if (consentSyncEnabled) {
        console.log(
          `Airtable consent sync starting for ${phoneNumber} -> ${consentValue} (callOutcome=${callOutcome})`,
        );
        try {
          consentRecordId = await syncConsentToAirtable(phoneNumber!, consentValue!, callId);
          console.log("Airtable consent sync finished", { consentRecordId });
        } catch (err) {
          console.error("Airtable consent sync failed:", err);
        }
      }

      if (callId && checkCallAllowed) {
        try {
          await syncCallLogToAirtable(
            payload,
            conversationLog || "",
            phoneNumber,
            callOutcome,
            callDuration,
            payload.audio_url ?? null,
            consentRecordId,
          );
        } catch (err) {
          console.error("Airtable call log sync failed:", err);
        }
      } else if (!callId) {
        console.warn("Airtable call log sync skipped: missing outbound_id/call_id");
      } else {
        console.log("Airtable call log sync skipped: CheckCall != 'Y'");
      }
    })();

    // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(consentThenCallLogTask);
    } else {
      await consentThenCallLogTask;
    }

    // --- Airtable notice_received sync (Dhipaya) — independent of consent/call log ---
    const noticeValue = aiResult.noticeReceived;
    if (phoneNumber && pickedUp && noticeValue && checkCallAllowed) {
      console.log(`Airtable notice sync starting for ${phoneNumber} -> ${noticeValue}`);
      const noticePromise = syncNoticeToAirtable(phoneNumber, noticeValue, callId)
        .then(() => console.log("Airtable notice sync finished"))
        .catch((err) => console.error("Airtable notice sync failed:", err));
      // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(noticePromise);
      } else {
        await noticePromise;
      }
    } else {
      console.log("Airtable notice sync skipped:", { phoneNumber, pickedUp, noticeReceived: aiResult.noticeReceived });
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
        .select("id, result_data")
        .eq("botnoi_call_id", callId)
        .maybeSingle();

      if (record) {
        callRecordId = record.id;
        const prevResultData = (record.result_data as Record<string, unknown> | null) ?? {};
        const { error: updateError } = await supabase
          .from("call_records")
          .update({
            status: mappedStatus,
            result_data: { ...prevResultData, ...payload, ai_category: aiCategory },
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
              conversation_log: conversationLog,
            }),
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
        finalStatus = mappedStatus === "hanged_up" ? "failed" : pickedUp ? "success" : "failed";
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
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ session_id: session.id, action: "continue" }),
          }).catch((err) => console.error("Error triggering session processor:", err));
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, handled: true, error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

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
  consentDecision: "Given" | "Denied" | null;
  noticeReceived: "Yes" | "No" | null;
};

// System-level statuses from the telephony layer all collapse to "Not Reached"
// in the new taxonomy (the customer could not actually be contacted).
const SYSTEM_STATUS_MAP: Record<string, { name: string; thai: string }> = {
  no_answer: { name: "Not Reached", thai: "ลูกค้าไม่รับสาย" },
  "no answer": { name: "Not Reached", thai: "ลูกค้าไม่รับสาย" },
  unreachable: { name: "Not Reached", thai: "ติดต่อไม่ได้" },
  rejected: { name: "Not Reached", thai: "ลูกค้าตัดสาย" },
  busy: { name: "Not Reached", thai: "ลูกค้าสายไม่ว่าง" },
  voicemail: { name: "Not Reached", thai: "เข้าสู่ระบบฝากข้อความ" },
  failed: { name: "Not Reached", thai: "โทรไม่สำเร็จ" },
};

// Dhipaya consent-flow taxonomy — must stay in sync with MAIN_STATUSES +
// SUB_STATUSES in src/features/dhipaya/lib/dhipaya-callStatuses.ts.
const CONVERSATION_CATEGORIES: { id: number; name: string; thai: string; group: "main" | "sub" }[] = [
  // --- Main outcomes ---
  { id: 1, name: "Transfer to Agent", thai: "โอนสายให้เจ้าหน้าที่", group: "main" },
  { id: 2, name: "Consent Given", thai: "ให้ความยินยอม", group: "main" },
  { id: 3, name: "Consent Denied", thai: "ปฏิเสธการให้ความยินยอม", group: "main" },
  { id: 4, name: "Callback Scheduled", thai: "นัดติดต่อกลับ", group: "main" },
  { id: 5, name: "Not Reached", thai: "ติดต่อไม่ได้", group: "main" },
  { id: 6, name: "Completed", thai: "สนทนาสำเร็จ", group: "main" },
  { id: 12, name: "Notice Received", thai: "ได้รับเอกสารแจ้งเตือนแล้ว", group: "main" },
  { id: 13, name: "Notice Not Received", thai: "ยังไม่ได้รับเอกสารแจ้งเตือน", group: "main" },

  // --- Conversation behaviors (fallbacks) ---
  { id: 7, name: "Not Convenient", thai: "ไม่สะดวกคุย", group: "sub" },
  { id: 8, name: "Wrong Person", thai: "ไม่ใช่ผู้เอาประกัน", group: "sub" },
  { id: 9, name: "Background Noise", thai: "เสียงแทรก/เสียงรบกวน", group: "sub" },
  { id: 10, name: "Silence", thai: "ลูกค้าเงียบ", group: "sub" },
  { id: 11, name: "Dropped Call", thai: "สายหลุดระหว่างสนทนา", group: "sub" },
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

function makeResult(
  name: string,
  reason: string,
  extras?: { consentDecision?: "Given" | "Denied" | null; noticeReceived?: "Yes" | "No" | null },
): ClassifyResult {
  const cat = CONVERSATION_CATEGORIES.find((c) => c.name === name)!;
  return {
    status_id: cat.id,
    status_name: cat.name,
    category: cat.name,
    reason,
    consentDecision: extras?.consentDecision ?? null,
    noticeReceived: extras?.noticeReceived ?? null,
  };
}

async function classifyCall(
  payload: Record<string, unknown>,
  log: string,
  apiKey: string | undefined,
): Promise<ClassifyResult> {
  // STEP 1: System-level status check (telephony layer)
  const rawStatus = String(payload.status || "")
    .toLowerCase()
    .trim();
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

  const categoryList = CONVERSATION_CATEGORIES.map((c) => `${c.id}. ${c.name} (${c.thai}) [${c.group}]`).join("\n");

  const systemPrompt = `You classify Thai outbound PDPA consent-collection call transcripts for Dhipaya Insurance. Return STRICT JSON only.

Choose exactly ONE category (use the EXACT English label) from this list:
${categoryList}

SCOPE
The bot's ONLY purpose is to obtain PDPA consent — permission for Dhipaya and its
business partners to process the customer's personal data in order to present
insurance products, promotions, or benefits via phone.

This is NOT a debt-collection call. IGNORE any mention of debt, loans, overdue
payments, policy premiums owed, balances, installments, or money owed. Even if
such topics appear in the transcript (customer confusion, off-topic remarks),
they MUST NOT influence the consent classification. Your only job is to determine
whether PDPA consent was given, denied, deferred, transferred, or never reached
— and, as a secondary signal, whether the renewal notice document was received.

INSURANCE RENEWAL CONTEXT
Some transcripts may include outbound insurance renewal conversations for
insurance policies partnered with Dhipaya / GSB. The bot may:
  - Inform customers that their insurance policy is nearing expiry
  - Confirm whether renewal documents (the "notice") were received
  - Explain renewal premium amounts
  - Describe payment channels such as GSB branches, QR payment, MyMo app,
    bank apps, or the Dhipaya Insure website
  - Mention installment promotions or payment offers
  - Thank the customer on behalf of Dhipaya Insurance and GSB

These insurance renewal / payment discussions are informational only and MUST
NOT affect PDPA consent classification. Do not interpret premium discussions,
installment offers, or payment explanations as debt collection, consent
approval, or consent denial unless the customer explicitly answers the PDPA
consent question.

The "notice check" exchange (did the customer receive the renewal document?)
IS the one renewal-context signal you may classify on — but only when no
PDPA consent decision was reached (see step 5 below).

DECISION ORDER (first match wins):

1. TRANSFER → Customer asks to speak with a human agent / staff
   ("ขอคุยกับเจ้าหน้าที่", "โอนสาย", "speak to a person") → "Transfer to Agent".

2. NOT CONVENIENT → Customer says they cannot talk now ("ไม่สะดวกคุย", "ไม่ว่าง",
   "ติดประชุม") AND no consent decision was reached → "Not Convenient".

3. CALLBACK SCHEDULED → Customer asks to be called back later
   ("โทรกลับพรุ่งนี้", "ติดต่อใหม่อาทิตย์หน้า") → "Callback Scheduled".

4. CONSENT DECISION → The bot actually asked the PDPA consent question AND the
   customer gave a clear answer about consenting to data processing / marketing:
   - Affirmative ("ยินยอม", "ตกลง", "ได้ครับ", "yes / agree") → "Consent Given"
   - Refusal ("ไม่ยินยอม", "ไม่สะดวกให้ข้อมูล", "ไม่อนุญาต", "no / don't agree")
     → "Consent Denied"

5. NOTICE CHECK → Only if no Consent Decision (step 4) was reached. The bot
   asked whether the renewal/notice document was received AND the customer
   answered:
   - Affirmative ("ได้รับแล้ว", "ได้รับเอกสารแล้ว", "yes received", "got it")
     → "Notice Received"
   - Negative ("ยังไม่ได้รับ", "ไม่ได้รับ", "haven't got it", "no, not yet")
     → "Notice Not Received"
   Consent ALWAYS wins over notice — if the customer answered the consent
   question, classify under step 4 even if they also discussed the notice.

6. COMPLETED → A real exchange happened and the call ended normally but none
   of the above applies (off-topic resolved, general question answered, etc.)
   → "Completed".

STRICT RULE — TARGET THE FINAL OUTCOME
"Consent Given", "Consent Denied", "Callback Scheduled", "Notice Received",
and "Notice Not Received" all require evidence that the relevant question was
actually reached and answered. If the line drops before that point use:
  - "Dropped Call" if the customer engaged briefly then the line cut, or
  - "Not Reached" if there was effectively no customer interaction.

"Wrong Person", "Background Noise", and "Silence" are only chosen when no main
outcome above applies.

Additionally, INDEPENDENTLY extract two secondary signals from the transcript:

- "consent_decision": Did the customer give or refuse PDPA consent?
  - "Given" if the customer clearly agreed to data processing / marketing consent
  - "Denied" if the customer clearly refused
  - null if the consent question was not answered

- "notice_received": Did the customer confirm whether they received the renewal/notice document?
  - "Yes" if the customer said they received the notice/document
  - "No" if the customer said they have NOT received the notice/document
  - null if the notice question was not answered

These two fields are INDEPENDENT — a single call may capture BOTH (e.g. the
customer confirms they received the notice AND gives consent). Extract each
signal on its own merits regardless of the chosen status_name.

Output format (STRICT JSON, no markdown, no commentary):
{
  "status_name": "<exact English label from the list>",
  "confidence": <number between 0 and 1>,
  "reason": "<short explanation focused on the PDPA consent or notice outcome>",
  "consent_decision": "Given" | "Denied" | null,
  "notice_received": "Yes" | "No" | null
}`;

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
    // Alias legacy / shorthand labels into the new Dhipaya taxonomy.
    const aliased =
      normalized === "transfer"
        ? "transfer to agent"
        : normalized === "consent" || normalized === "agree"
          ? "consent given"
          : normalized === "refused" || normalized === "decline" || normalized === "declined"
            ? "consent denied"
            : normalized === "call later" || normalized === "scheduled callback"
              ? "callback scheduled"
              : normalized;
    const match = CONVERSATION_CATEGORIES.find((c) => c.name.toLowerCase() === aliased);

    // Independent extraction of consent_decision and notice_received signals.
    const rawConsent = String(parsed?.consent_decision ?? "")
      .trim()
      .toLowerCase();
    const consentDecision: "Given" | "Denied" | null =
      rawConsent === "given" ? "Given" : rawConsent === "denied" ? "Denied" : null;

    const rawNotice = String(parsed?.notice_received ?? "")
      .trim()
      .toLowerCase();
    const noticeReceived: "Yes" | "No" | null = rawNotice === "yes" ? "Yes" : rawNotice === "no" ? "No" : null;

    console.log("AI independent signals:", { consentDecision, noticeReceived });

    if (match) {
      return {
        status_id: match.id,
        status_name: match.name,
        category: match.name,
        reason: parsed?.reason || "AI classification",
        consentDecision,
        noticeReceived,
      };
    }

    console.warn("Unmatched AI category, defaulting to Completed:", aiName);
    return makeResult("Completed", `Unmatched AI category: ${aiName}`, { consentDecision, noticeReceived });

    console.warn("Unmatched AI category, defaulting to Completed:", aiName);
    return makeResult("Completed", `Unmatched AI category: ${aiName}`);
  } catch (err) {
    console.error("AI classification error:", err);
    return makeResult("Completed", "Classifier exception");
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

async function extractCallbackDate(conversationLog: string | null, apiKey: string | undefined): Promise<string | null> {
  if (!conversationLog || conversationLog.trim().length < 5) return null;
  if (!apiKey) return null;

  const referenceDate = parseLogReferenceDate(conversationLog);
  const refIso = bangkokIsoDate(referenceDate);

  const systemPrompt = `You extract a callback date from a Thai PDPA consent-collection call transcript.

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
// AIRTABLE CONSENT SYNC
// Looks up the Dhipaya Customer in Airtable by phone, then patches or creates
// a Consents row with the AI-determined consent outcome.
// ============================================================================

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

/**
 * Normalize Thai phone numbers to local 10-digit form starting with "0".
 */
function normalizePhone(p: string): string {
  let digits = (p || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("66") && digits.length >= 11) {
    digits = "0" + digits.slice(2);
  }
  if (digits.length === 9 && !digits.startsWith("0")) {
    digits = "0" + digits;
  }
  return digits;
}

async function airtableFetch(path: string, init: RequestInit, pat: string): Promise<any> {
  const maxAttempts = 5;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${AIRTABLE_API_BASE}/${path}`, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      lastErr = e;
      const delay = Math.floor(200 + Math.random() * 800) * attempt;
      console.log(`Airtable network error. Retrying attempt #${attempt + 1} after ${delay}ms...`, e);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    const text = await res.text();
    if (res.status === 429 || /Too Many Requests/i.test(text)) {
      const delay = Math.floor(200 + Math.random() * 800) * attempt;
      console.log(
        `Airtable update hit Rate Limit (429). Retrying attempt #${attempt} after ${delay}ms... path=${path}`,
      );
      lastErr = new Error(`Airtable 429: ${text.slice(0, 200)}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      console.error(`CRITICAL: Airtable rate-limit retries exhausted for ${path}`);
      throw lastErr;
    }
    if (!res.ok) {
      throw new Error(`Airtable ${res.status}: ${text.slice(0, 300)}`);
    }
    const parsed = text ? JSON.parse(text) : {};
    if (init.method && init.method !== "GET" && parsed?.id) {
      console.log("Airtable update successful for record:", parsed.id);
    }
    return parsed;
  }
  throw lastErr ?? new Error("Airtable fetch failed");
}

async function isCheckCallAllowed(phone: string): Promise<boolean> {
  const pat = Deno.env.get("AIRTABLE_PAT");
  const baseId = Deno.env.get("AIRTABLE_BASE_ID");
  if (!pat || !baseId) {
    console.warn("CheckCall gate: Airtable credentials missing — denying write-back.");
    return false;
  }
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const phoneFormula = phoneCheckCallFormula(normalized);

  try {
    const res = await airtableFetch(
      `${baseId}/Customer?filterByFormula=${encodeURIComponent(phoneFormula)}&maxRecords=1&fields%5B%5D=CheckCall&fields%5B%5D=Customer_ID`,
      { method: "GET" },
      pat,
    );
    const rec = res?.records?.[0];
    if (!rec) {
      console.warn(`CheckCall gate: no Customer found for phone ${normalized} — denying.`);
      return false;
    }
    const raw = rec.fields?.["CheckCall"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const ok =
      String(value ?? "")
        .trim()
        .toUpperCase() === "Y";
    console.log(
      `CheckCall gate: phone=${normalized} Customer_ID=${rec.fields?.["Customer_ID"]} CheckCall=${JSON.stringify(value)} allowed=${ok}`,
    );
    return ok;
  } catch (e) {
    console.error("CheckCall gate: Airtable lookup failed —", e);
    return false;
  }
}

// Shared customer lookup: try customer_rec_id (from call_records.result_data) first,
// then fall back to phone via phoneCheckCallFormula. Prevents duplicate-phone collisions.
async function findCustomerRecord(
  callLogId: string | null | undefined,
  phone: string | null | undefined,
  pat: string,
  baseId: string,
  context: string,
): Promise<any | null> {
  let resultData: any = null;
  if (callLogId) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data } = await sb
          .from("call_records")
          .select("result_data")
          .eq("botnoi_call_id", String(callLogId))
          .maybeSingle();
        resultData = data?.result_data ?? null;
      }
    } catch (e) {
      console.warn(`[${context}] call_records lookup failed`, e);
    }
  }

  const customerRecId: string | undefined = resultData?.customer_rec_id;
  if (customerRecId && typeof customerRecId === "string" && customerRecId.startsWith("rec")) {
    try {
      const rec = await airtableFetch(`${baseId}/Customer/${customerRecId}`, { method: "GET" }, pat);
      if (rec?.id) return rec;
    } catch (e) {
      console.warn(`[${context}] direct Customer fetch failed for ${customerRecId}`, e);
    }
  }

  if (phone) {
    const normalized = normalizePhone(phone);
    if (normalized) {
      const phoneFormula = phoneCheckCallFormula(normalized);
      try {
        const customerRes = await airtableFetch(
          `${baseId}/Customer?filterByFormula=${encodeURIComponent(phoneFormula)}&maxRecords=1`,
          { method: "GET" },
          pat,
        );
        const rec = customerRes?.records?.[0] ?? null;
        if (rec) return rec;
      } catch (e) {
        console.warn(`[${context}] customer lookup by phone failed`, e);
      }
    }
  }

  console.warn(`[${context}] no Customer match (rec_id=${customerRecId ?? "none"}, phone=${phone ?? "unknown"})`);
  return null;
}

async function syncConsentToAirtable(
  phone: string,
  aiCategory: "Consent Given" | "Consent Denied",
  callLogId?: string | null,
): Promise<string | null> {
  const pat = Deno.env.get("AIRTABLE_PAT");
  const baseId = Deno.env.get("AIRTABLE_BASE_ID");
  if (!pat || !baseId) {
    console.warn("Airtable credentials missing; skipping consent sync");
    return null;
  }

  const customerRec = await findCustomerRecord(callLogId, phone, pat, baseId, "Airtable consent");
  if (!customerRec?.id) return null;

  // Always create a new Consents row (no upsert).
  const consentUuid = crypto.randomUUID();
  const created = await airtableFetch(
    `${baseId}/Consents`,
    {
      method: "POST",
      body: JSON.stringify({
        fields: { Consent_ID: consentUuid, Consent_Status: aiCategory, Customer: [customerRec.id] },
      }),
    },
    pat,
  );
  const consentRecId: string | null = created?.id ?? null;
  console.log(
    `Airtable consent CREATED for Customer rec ${customerRec.id}: ${aiCategory} (Consent rec ${consentRecId ?? "unknown"})`,
  );
  return consentRecId;
}

async function syncNoticeToAirtable(phone: string, value: "Yes" | "No", callLogId?: string | null): Promise<void> {
  const pat = Deno.env.get("AIRTABLE_PAT");
  const baseId = Deno.env.get("AIRTABLE_BASE_ID");
  if (!pat || !baseId) {
    console.warn("Airtable credentials missing; skipping notice sync");
    return;
  }

  const customerRec = await findCustomerRecord(callLogId, phone, pat, baseId, "Airtable notice");
  if (!customerRec?.id) return;

  await airtableFetch(
    `${baseId}/Customer/${customerRec.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: { notice_received: value } }),
    },
    pat,
  );
  console.log(`Airtable notice_received updated for Customer ${customerRec.id}: ${value}`);
}

function mapCallStatus(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  if (["completed", "confirmed", "success"].includes(s)) return "Completed";
  if (["noanswer", "noresponse"].includes(s)) return "No Answer";
  if (["busy"].includes(s)) return "Busy";
  if (["voicemail", "machine", "answeringmachine"].includes(s)) return "Voicemail";
  if (["transferred", "transfer"].includes(s)) return "Transferred";
  return null;
}

async function syncCallLogToAirtable(
  payload: any,
  conversationLog: string,
  phone: string | null,
  callOutcome: string | null,
  callDuration: any,
  audioUrl: string | null,
  consentRecordId?: string | null,
): Promise<void> {
  const pat = Deno.env.get("AIRTABLE_PAT");
  const baseId = Deno.env.get("AIRTABLE_BASE_ID");
  if (!pat || !baseId) {
    console.warn("Airtable credentials missing; skipping call log sync");
    return;
  }

  // Call_Log_ID is volatile (changes every call) — kept only for traceability,
  // never used for lookup. Lookup is by Customer link only.
  const callLogId = payload?.outbound_id || payload?.call_id;

  // Step A: load result_data from call_records (single lookup; reused for customer + campaign)
  let resultData: any = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && supabaseKey) {
      const sb = createClient(supabaseUrl, supabaseKey);
      const { data } = await sb
        .from("call_records")
        .select("result_data")
        .eq("botnoi_call_id", String(callLogId))
        .maybeSingle();
      resultData = data?.result_data ?? null;
      console.log("Result data from call_records: ", resultData);
    }
  } catch (e) {
    console.warn("Airtable call log: call_records lookup failed", e);
  }

  // Step B: find Customer via shared helper (customer_rec_id first, phone fallback)
  const customerRec = await findCustomerRecord(callLogId, phone, pat, baseId, "Airtable call log");

  // Always create a new Call Logs row (no lookup / no upsert)
  const tablePath = "Call%20Logs";

  // Determine campaign header from payload.variables or result_data.

  // Intents can come back with language suffixes like "campaign2[ENG]" or
  // "consent_EN" / "consent_ISAN" — strip those before matching.
  const rawBotType: unknown =
    payload?.variables?.campaign_determined ||
    payload?.variables?.bot_type ||
    payload?.variables?.next_intent ||
    payload?.variables?.intent ||
    payload?.bot_type ||
    payload?.next_intent ||
    payload?.intent ||
    resultData?.campaign_determined ||
    resultData?.bot_type ||
    resultData?.next_intent ||
    resultData?.intent ||
    resultData?.variables?.bot_type ||
    resultData?.variables?.next_intent ||
    resultData?.variables?.intent;
  const normalizeBot = (v: unknown) =>
    String(v ?? "")
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, "") // strip [ENG], [ภาษาถิ่นอีสาน] etc.
      .replace(/_(en|isan|th)$/i, "") // strip _EN / _ISAN / _TH suffix
      .trim();
  let normalizedBotType = normalizeBot(rawBotType);
  console.log("Campaign detection (primary):", { rawBotType, normalizedBotType });

  // Campaign header is driven strictly by normalizedBotType (the script used).
  let campaignHeader: string;

  // 1. ตรวจสอบข้อมูลจาก Airtable เป็นอันดับแรก (Priority 1)
  if (customerRec) {
    const cStatusRaw = customerRec.fields?.["Consent_Status (from Consents)"];
    const pStatusRaw = customerRec.fields?.["Policy_Status (from Policy)"];
    console.log("DEBUG Airtable Raw:", { cStatusRaw, pStatusRaw });
    const consentStatus = (Array.isArray(cStatusRaw) ? cStatusRaw[0] : cStatusRaw || "")
      .toString()
      .trim()
      .toLowerCase();
    const policyStatus = (Array.isArray(pStatusRaw) ? pStatusRaw[0] : pStatusRaw || "").toString().trim().toLowerCase();

    // กฎเหล็ก: ถ้า Consent ว่าง ต้องเป็น Campaign 1 เสมอ
    if (consentStatus === "" || consentStatus === "blank") {
      campaignHeader = "Campaign 1";
    }
    // ถ้ามี Consent แล้ว ค่อยเช็คเงื่อนไขอื่นต่อ
    else if (policyStatus === "overdue" || normalizedBotType === "campaign2") {
      campaignHeader = "Campaign 2";
    } else if (policyStatus === "prospect" || normalizedBotType === "campaign3") {
      campaignHeader = "Campaign 3";
    } else {
      campaignHeader = "Campaign 1";
    }
  }
  // 2. ถ้าหาข้อมูลใน Airtable ไม่เจอ (เช่น เบอร์ใหม่จริงๆ) ค่อยไปเชื่อ Bot Type (Priority 2)
  else {
    if (normalizedBotType === "campaign2") {
      campaignHeader = "Campaign 2";
    } else if (normalizedBotType === "campaign3") {
      campaignHeader = "Campaign 3";
    } else {
      campaignHeader = "Campaign 1";
    }
  }

  // Build fields
  const fields: Record<string, unknown> = {
    Conversation_Logs: `${campaignHeader}\n\n${conversationLog}`,
    audio_url: audioUrl || "",
  };
  const durationNum = callDuration != null ? Number(callDuration) : NaN;
  if (Number.isFinite(durationNum)) fields.Call_Duration = Math.round(durationNum);
  const mappedStatus = mapCallStatus(callOutcome) ?? mapCallStatus(payload?.status);
  if (mappedStatus) fields.Call_Status = mappedStatus;
  // Step D: always CREATE a new Call Logs row. No lookup, no PATCH.
  if (!customerRec?.id) {
    console.warn("Airtable call log: no Customer matched; skipping create to avoid orphan row");
    return;
  }

  const createFields: Record<string, unknown> = {
    ...fields,
    Customer: [customerRec.id],
  };
  if (consentRecordId && typeof consentRecordId === "string" && consentRecordId.startsWith("rec")) {
    createFields.Consents = [consentRecordId];
  }
  const callLogIdStr = callLogId != null ? String(callLogId).trim() : "";
  if (callLogIdStr) createFields.Call_Log_ID = callLogIdStr; // traceability only

  // Add Call_Timestamp from the first conversation_log entry
  const firstTimestamp = payload?.conversation_log?.[0]?.timeStamp;
  if (firstTimestamp && typeof firstTimestamp === "string") {
    createFields.Call_Timestamp = firstTimestamp;
  }
  await airtableFetch(
    `${baseId}/${tablePath}`,
    { method: "POST", body: JSON.stringify({ fields: createFields }) },
    pat,
  );
  console.log(
    `Airtable call log CREATED for Customer ${customerRec.id}${consentRecordId ? ` linked to Consent ${consentRecordId}` : ""}`,
  );
}
