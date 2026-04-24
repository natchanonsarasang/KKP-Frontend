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

    const pickedUp = hasUsersuser_idspoken_PLACEHOLDER;

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

    // --- AI Categorization ---
    const aiCategory = await categorizeConversation(conversationLog || "", status, mappedStatus, LOVABLE_API_KEY);
    console.log("AI Category:", aiCategory);

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

    console.log("Resolved owner:", { resolvedUserId, resolvedWorkspaceId });

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
        await supabase
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
        console.log("Call record updated:", record.id);
      } else if (phoneNumber) {
        const { data: newRecord } = await supabase
          .from("call_records")
          .insert({
            botnoi_call_id: callId,
            phone_number: phoneNumber,
            status: mappedStatus,
            result_data: payload,
            call_duration: callDuration ? Math.round(Number(callDuration)) : null,
            appointment_date: appointmentDate || null,
            appointment_time: appointmentTime || null,
            user_id: resolvedUserId,
            workspace_id: resolvedWorkspaceId,
          })
          .select("id")
          .single();
        callRecordId = newRecord?.id || null;
        console.log("Call record created:", callRecordId);
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
        } else if (debtorId) {
          const { data: newItem } = await supabase
            .from("call_list_items")
            .insert({
              debtor_id: debtorId,
              user_id: resolvedUserId,
              workspace_id: resolvedWorkspaceId,
              status: finalStatus,
              call_outcome: callOutcome,
              picked_up: pickedUp,
              notes: notesData,
              call_record_id: callRecordId,
              ai_category: aiCategory,
              called_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          console.log("Call list item auto-created");

          // Log attempt for auto-created item
          if (newItem) {
            await supabase.from("call_attempts").insert({
              call_list_item_id: newItem.id,
              call_record_id: callRecordId,
              user_id: resolvedUserId,
              attempt_number: 1,
              status: finalStatus,
              call_outcome: callOutcome,
              picked_up: pickedUp,
              ai_category: aiCategory,
              conversation_log: conversationLog || null,
              audio_url: audioUrl || null,
              call_duration: callDuration ? Math.round(Number(callDuration)) : null,
              error_reason: mappedStatus === "failed" || mappedStatus === "no_answer" ? payload.error || status : null,
            });
            console.log("Initial attempt logged for auto-created item");
          }
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
          console.log(`Updating session ${session.id} stats:`, updates);
          await supabase
            .from("call_sessions")
            .update(updates)
            .eq("id", session.id);
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

// AI categorization using Lovable AI
async function categorizeConversation(
  log: string,
  status: string,
  mappedStatus: string,
  apiKey: string | undefined,
): Promise<string> {
  if (status === "no_answer" || status === "busy" || status === "unreachable") {
    return "No answer – call back later";
  }
  if (status === "failed" || status === "error") {
    return "Phone is turned off";
  }
  if (!log || log.trim().length < 5) {
    if (mappedStatus === "completed") return "Customer silent";
    return "No answer – call back later";
  }

  // Rule-based: noisy environment keywords
  const noisyKeywords = ["ไม่ได้ยิน", "พูดอะไร", "เสียงดัง", "ฟังไม่ชัด", "ได้ยินไม่ชัด", "can't hear", "cannot hear"];
  const logLower = log.toLowerCase();
  if (noisyKeywords.some((kw) => logLower.includes(kw))) {
    return "Customer in noisy environment";
  }
  if (!apiKey) {
    console.warn("LOVABLE_API_KEY not found, skipping AI categorization");
    return "Customer has hardship situation";
  }

  const CATEGORIES = [
    "Customer in noisy environment",
    "Customer not convenient to talk",
    "Customer refused to pay",
    "Customer interested in debt restructuring",
    "Customer requested human agent",
    "Customer promised to pay with date",
    "Customer promised to pay (no date)",
    "No answer – call back later",
    "Customer refused to talk to bot",
    "Customer has hardship situation",
    "Language barrier",
    "Customer silent",
    "Phone is turned off",
  ];

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You categorize debt collection call transcripts into exactly one of these 13 categories. Return ONLY the category string, nothing else.\n\n${CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
          },
          { role: "user", content: `Analyze this transcript: "${log}"` },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status);
      return "Customer has hardship situation";
    }

    const result = await response.json();
    const category = result.choices?.[0]?.message?.content?.trim();
    if (category && CATEGORIES.includes(category)) return category;
    for (const c of CATEGORIES) {
      if (category?.includes(c)) return c;
    }
    return "Customer has hardship situation";
  } catch (err) {
    console.error("AI categorization error:", err);
    return "Customer has hardship situation";
  }
}
