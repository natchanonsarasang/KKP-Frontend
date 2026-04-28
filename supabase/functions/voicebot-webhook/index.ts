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

    if (!callId && !phoneNumber) {
      return new Response(JSON.stringify({ success: true, message: "No identifiable data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user actually spoke in the conversation
    // A valid pickup should have at least one "User:" entry with some text after it
    const userParts = conversationLog ? conversationLog.split("User:") : [];
    const hasUserSpoken = userParts.length > 1 && userParts[1].trim().length > 0;

    // Map Botnoi status to our internal status
    const rawStatus = (status || "").toLowerCase();
    let mappedStatus = "failed";

    if (["Confirm", "confirm", "yes", "Yes"].includes(action)) {
      mappedStatus = "confirmed";
    } else if (["Decline", "decline", "no", "No"].includes(action)) {
      mappedStatus = "declined";
    } else if (["Unknown", "unknown"].includes(action)) {
      mappedStatus = "no_response";
    } else if (rawStatus === "completed") {
      // If Botnoi says completed, but no one actually spoke, treat it as no_answer (retryable)
      mappedStatus = hasUserSpoken ? "completed" : "no_answer";
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

    const pickedUp = hasUserSpoken || ["confirmed", "declined", "no_response"].includes(mappedStatus);
    let finalStatus: string = pickedUp ? "success" : "failed";

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
    };
    const callOutcome = outcomeMap[mappedStatus] || "Unknown";

    console.log("Mapped:", { mappedStatus, pickedUp, callOutcome });

    // --- AI Categorization (strict status classifier) ---
    const aiResult = await classifyCall(payload, conversationLog || "", LOVABLE_API_KEY);
    const aiCategory = aiResult.category;
    console.log("AI Classification:", aiResult);

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
        finalStatus = pickedUp ? "success" : "failed";
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

        await supabase.from("debtors").update(updateData).eq("id", debtor.id);
        console.log("Debtor stats updated");
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

// Strict call classifier
// STEP 1: Check json_log status first → No Answer / Rejected / Busy / Voicemail
// STEP 2: If none, classify conversation_log into one of 12 conversation categories
type ClassifyResult = {
  status_id: number;
  status_name: string;
  category: string;
  reason: string;
};

const SYSTEM_STATUS_MAP: Record<string, { id: number; name: string; category: string; thai: string }> = {
  no_answer: { id: 1, name: "No Answer", category: "No Answer", thai: "ลูกค้าไม่รับสาย" },
  "no answer": { id: 1, name: "No Answer", category: "No Answer", thai: "ลูกค้าไม่รับสาย" },
  unreachable: { id: 1, name: "No Answer", category: "No Answer", thai: "ลูกค้าไม่รับสาย" },
  rejected: { id: 2, name: "Rejected", category: "Rejected", thai: "ลูกค้าตัดสาย" },
  busy: { id: 3, name: "Busy", category: "Busy", thai: "ลูกค้าสายไม่ว่าง" },
  voicemail: { id: 4, name: "Voicemail", category: "Voicemail", thai: "เข้าสู่ระบบฝากข้อความ" },
};

const CONVERSATION_CATEGORIES = [
  { id: 5, name: "Not Convenient", thai: "ลูกค้าไม่สะดวกคุย" },
  { id: 6, name: "Already Paid", thai: "ลูกค้าแจ้งว่าชำระเรียบร้อยแล้ว" },
  { id: 7, name: "Normal Flow", thai: "แจ้งข้อมูลครบกำหนดชำระเบี้ยได้สำเร็จ" },
  { id: 8, name: "Wrong Person", thai: "ลูกค้าแจ้งไม่ใช่ผู้เอาประกัน" },
  { id: 9, name: "Transfer", thai: "ลูกค้าขอคุยกับเจ้าหน้าที่" },
  { id: 10, name: "Call Later", thai: "ลูกค้านัดหมายให้ติดต่อใหม่" },
  { id: 11, name: "Barge-in", thai: "ลูกค้าสอบถามข้อมูลระหว่างสนทนา" },
  { id: 12, name: "Background Noise", thai: "เสียงแทรก/เสียงรบกวน" },
  { id: 13, name: "Out of Topic", thai: "ลูกค้าพูดเรื่องอื่น" },
  { id: 14, name: "Silence", thai: "ลูกค้าเงียบ" },
  { id: 15, name: "Dropped Call", thai: "สายหลุดระหว่างสนทนา" },
  { id: 16, name: "Repeat Request", thai: "ลูกค้าแจ้งให้ทวนประโยคเดิม" },
];

async function classifyCall(
  payload: Record<string, unknown>,
  log: string,
  apiKey: string | undefined,
): Promise<ClassifyResult> {
  // STEP 1: System-level status check (json_log)
  const rawStatus = String(payload.status || "").toLowerCase().trim();
  const sys = SYSTEM_STATUS_MAP[rawStatus];
  if (sys) {
    return {
      status_id: sys.id,
      status_name: sys.name,
      category: sys.category,
      reason: `System status: ${rawStatus} → ${sys.thai}`,
    };
  }

  // STEP 2: Conversation analysis required
  if (!log || log.trim().length < 5) {
    const silence = CONVERSATION_CATEGORIES.find((c) => c.name === "Silence")!;
    return {
      status_id: silence.id,
      status_name: silence.name,
      category: silence.name,
      reason: "No conversation log present",
    };
  }

  if (!apiKey) {
    console.warn("LOVABLE_API_KEY not found, defaulting to Normal Flow");
    return { status_id: 7, status_name: "Normal Flow", category: "Normal Flow", reason: "AI key missing" };
  }

  const categoryList = CONVERSATION_CATEGORIES.map(
    (c) => `${c.id}. ${c.name} (${c.thai})`,
  ).join("\n");

  const systemPrompt = `You classify Thai debt-collection call transcripts. Return STRICT JSON only.
Choose exactly ONE conversation category from this list:
${categoryList}

CRITICAL CLASSIFICATION RULES:
- ALWAYS classify by the FINAL OUTCOME of the call, not by transient events that occurred mid-conversation.
- "Repeat Request", "Barge-in", "Background Noise", and "Out of Topic" are TRANSIENT events, NOT final statuses.
  Only use them if the call ENDED WITHOUT a clear resolution (e.g., the conversation ended while still off-topic, still being interrupted by noise, or still asking to repeat — with no resolved outcome).
- If the customer eventually confirmed/acknowledged payment info → "Normal Flow".
- If the customer eventually said they already paid → "Already Paid".
- If the customer eventually said it's the wrong person → "Wrong Person".
- If the customer eventually requested to talk to staff → "Transfer".
- If the customer eventually asked to be called back later → "Call Later".
- If the customer eventually said it's not convenient → "Not Convenient".
- Prefer the resolved outcome over any earlier interruption, repeat request, off-topic remark, or background noise.

BARGE-IN vs DROPPED CALL (IMPORTANT DISTINCTION):
- "Barge-in" = the customer INTERRUPTED the bot to ASK A QUESTION or interact mid-call. Use this even if the call ended abruptly afterward, as long as there was a customer question/interaction before the end.
- "Dropped Call" = the call was cut off / disconnected with NO question or interaction from the customer (pure disconnection, silence, or technical drop with no engagement).
- Examples:
  * Customer asked a question mid-call → call ended → "Barge-in"
  * Call suddenly disconnected, no customer interaction at all → "Dropped Call"

Output format (STRICT JSON, no markdown):
{
  "status_id": <number 5-16>,
  "status_name": "<exact English label>",
  "reason": "<short explanation focused on the FINAL outcome>",
  "chart_update": { "category": "<exact English label>", "increment": 1 }
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
      return { status_id: 7, status_name: "Normal Flow", category: "Normal Flow", reason: "AI request failed" };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const chartCategory: string = parsed?.chart_update?.category || parsed?.status_name;
    const match = CONVERSATION_CATEGORIES.find(
      (c) => c.name.toLowerCase() === String(chartCategory || "").toLowerCase(),
    );

    if (match) {
      return {
        status_id: match.id,
        status_name: match.name,
        category: match.name,
        reason: parsed?.reason || "AI classification",
      };
    }

    return { status_id: 7, status_name: "Normal Flow", category: "Normal Flow", reason: "Unmatched AI category" };
  } catch (err) {
    console.error("AI classification error:", err);
    return { status_id: 7, status_name: "Normal Flow", category: "Normal Flow", reason: "Classifier exception" };
  }
}

