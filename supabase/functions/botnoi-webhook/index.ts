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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log("Webhook payload received:", JSON.stringify(payload, null, 2));

    // Function to categorize conversation using AI
    const categorizeConversation = async (
      log: string,
      status: string,
    ): Promise<{ category: string; callback_time?: string }> => {
      const rawStatus = (status || "").toLowerCase();

      // 1. Check system-level statuses first to save tokens
      if (
        rawStatus === "no_answer" ||
        rawStatus === "busy" ||
        rawStatus === "unreachable" ||
        rawStatus === "no answer"
      ) {
        return { category: "ไม่รับสาย → โทรรอบ 2" };
      }

      if (rawStatus === "failed" || rawStatus === "error") {
        return { category: "โทรแล้วปิดเครื่อง" };
      }

      if (rawStatus === "rejected") {
        return { category: "ลูกค้ากดตัดสาย" };
      }

      if (rawStatus === "voicemail") {
        return { category: "ระบบฝากข้อความเสียง" };
      }

      // 2. If no log, and status is completed, it might be "ลูกค้าไม่พูด" or "เงียบ"
      if (!log || log.trim().length < 5) {
        if (rawStatus === "completed") return { category: "ลูกค้าไม่พูด" };
        return { category: "ไม่รับสาย → โทรรอบ 2" };
      }

      if (!LOVABLE_API_KEY) {
        console.warn("LOVABLE_API_KEY not found, skipping AI categorization");
        return { category: "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)" };
      }

      // 3. Ask AI to categorize the log
      try {
        const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
        const prompt = `
          Analyze this debt collection call transcript and categorize the outcome.
          Transcript: "${log}"

          Categories:
          1. ลูกค้าไม่สะดวกคุย (Not Convenient)
          2. ลูกค้าแจ้งว่าชำระเรียบร้อยแล้ว (Already Paid) 
          3. แจ้งข้อมูลครบกำหนดชำระเบี้ยได้สำเร็จ (Normal Flow) 
          4. ลูกค้าแจ้งไม่ใช่ผู้เอาประกัน (Wrong Person)
          5. ลูกค้าขอคุยกับเจ้าหน้าที่ (Transfer) 
          6. ลูกค้านัดหมายให้ติดต่อใหม่ (Call Later) 
          7. ลูกค้าสอบถามข้อมูลระหว่างสนทนา (Barge-in)
          8. เสียงแทรก/เสียงรบกวน (Background Noise)
          9. ลูกค้าพูดเรื่องอื่น (Out of Topic) 
          10. ลูกค้าเงียบ (Silence)
          11. สายหลุดระหว่างสนทนา (Dropped Call) 
          12. ลูกค้าแจ้งให้ทวนประโยคเดิม (Repeat Request) 

          For category 14, extract the requested callback time.
          Current system time (Bangkok) is: ${currentTime}.
          If the customer says "tomorrow", calculate based on this time.

          Return JSON format: {"category": "Category Name", "callback_time": "ISO_TIMESTAMP or null"}
        `;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are an expert debt collection call analyzer." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
          }),
        });

        const result = await response.json();
        const aiData = JSON.parse(result.choices?.[0]?.message?.content || "{}");

        return {
          category: aiData.category || "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)",
          callback_time: aiData.callback_time || null,
        };
      } catch (e) {
        console.error("AI categorization error:", e);
        return { category: "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)" };
      }
    };

    const callId = payload.outbound_id || payload.call_id;
    const status = payload.status || "pending";
    const action = payload.action;
    let phoneNumber = payload.phone_number || payload["Tel. Number"];

    // Extract phone from audio_url if not provided
    if (!phoneNumber && payload.audio_url) {
      const match = payload.audio_url.match(/_(\d+)\.wav$/);
      if (match) phoneNumber = match[1];
    }

    console.log("Extracted data:", { callId, status, action, phoneNumber });

    if (callId || phoneNumber) {
      // Use raw status from Botnoi directly as requested
      const mappedStatus = status;
      const rawStatusLower = (status || "").toLowerCase();

      // We still need to know if someone picked up for stats
      const audioUrl = payload.audio_url || null;
      const conversationLog = payload.conversation_log || payload.transcript || payload.transcription || null;

      const userParts = conversationLog ? conversationLog.split("User:") : [];
      const hasUserSpoken = userParts.length > 1 && userParts[1].trim().length > 0;

      // Map action to English outcome text for display
      let callOutcome = status;
      if (action && action !== "Unknown" && action !== "unknown") {
        callOutcome = action;
      }

      // Determine if call was picked up
      const pickedUp = hasUserSpoken || (action && action !== "Unknown" && action !== "unknown");

      const callDuration = payload.duration || payload.call_duration || payload.talk_time || null;

      // Perform AI categorization
      const aiResult = await categorizeConversation(conversationLog || "", status);
      const aiCategory = aiResult.category;

      // --- Resolve phoneNumber and callRecordId ---
      let callRecordId: string | null = null;
      if (callId) {
        const { data: callRecord } = await supabase
          .from("call_records")
          .select("id, phone_number")
          .eq("botnoi_call_id", callId)
          .maybeSingle();

        if (callRecord) {
          callRecordId = callRecord.id;
          if (!phoneNumber && callRecord.phone_number) {
            phoneNumber = callRecord.phone_number;
            console.log("Resolved phoneNumber from call_records:", phoneNumber);
          }

          // Update the call record with latest status
          await supabase
            .from("call_records")
            .update({
              status: mappedStatus,
              result_data: payload,
              call_duration: callDuration ? Math.round(Number(callDuration)) : null,
              ai_category: aiCategory,
              updated_at: new Date().toISOString(),
            })
            .eq("id", callRecord.id);
        }
      }

      // 2. Update call_list_items
      if (phoneNumber) {
        const { data: debtors } = await supabase.from("debtors").select("id").eq("phone_number", phoneNumber);

        if (debtors && debtors.length > 0) {
          const debtorIds = debtors.map((d) => d.id);

          let recentItem: { id: string; retry_count: number } | null = null;

          // Strategy 1: Find by callRecordId (most reliable)
          if (callRecordId) {
            const { data: byRecord } = await supabase
              .from("call_list_items")
              .select("id, retry_count")
              .eq("call_record_id", callRecordId)
              .maybeSingle();
            if (byRecord) recentItem = byRecord;
          }

          // Strategy 2: Fall back to debtor_id + status
          if (!recentItem && debtorIds.length > 0) {
            const { data: byDebtor } = await supabase
              .from("call_list_items")
              .select("id, retry_count")
              .in("debtor_id", debtorIds)
              .eq("status", "calling")
              .order("called_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (byDebtor) recentItem = byDebtor;
          }

          if (recentItem) {
            const currentRetryCount = recentItem.retry_count || 0;
            const MAX_RETRIES = 0;
            const RETRY_DELAY_MS = 5 * 1000;

            // Logic to determine retry: if not picked up and status looks like a failure
            const isRetryable =
              !pickedUp &&
              ["failed", "no answer", "no_answer", "busy", "error", "rejected", "voicemail"].includes(rawStatusLower);

            let retryStatus = pickedUp ? "success" : mappedStatus;
            let nextRetryAt = null;
            let newRetryCount = currentRetryCount;

            if (isRetryable && currentRetryCount < MAX_RETRIES) {
              retryStatus = "pending_retry";
              newRetryCount = currentRetryCount + 1;
              nextRetryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
            } else if (isRetryable && currentRetryCount >= MAX_RETRIES) {
              retryStatus = "final_failed";
            }

            // Handle AI postponement
            if (aiResult.category === "ลูกค้านัดโทรใหม่ภายหลัง" && aiResult.callback_time) {
              retryStatus = "pending";
              nextRetryAt = new Date(aiResult.callback_time).toISOString();
            }

            await supabase
              .from("call_list_items")
              .update({
                status: retryStatus,
                call_outcome: callOutcome,
                picked_up: pickedUp,
                notes: JSON.stringify({ audio_url: audioUrl, conversation_log: conversationLog }),
                ai_category: aiCategory,
                retry_count: newRetryCount,
                next_retry_at: nextRetryAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", recentItem.id);

            // 3. Trigger next call or update session stats
            const { data: activeSessions } = await supabase
              .from("call_sessions")
              .select("id, completed_calls, failed_calls, confirmed_calls")
              .eq("status", "running")
              .limit(10);

            if (activeSessions) {
              for (const session of activeSessions) {
                const updates: any = {};
                if (retryStatus === "success" || pickedUp) {
                  updates.completed_calls = (session.completed_calls || 0) + 1;
                  if (action && (action.toLowerCase() === "confirm" || action.toLowerCase() === "yes")) {
                    updates.confirmed_calls = (session.confirmed_calls || 0) + 1;
                  }
                } else if (retryStatus === "final_failed") {
                  updates.failed_calls = (session.failed_calls || 0) + 1;
                }

                if (Object.keys(updates).length > 0) {
                  await supabase.from("call_sessions").update(updates).eq("id", session.id);
                }

                // Trigger next call background
                supabase.functions.invoke("process-call-session").catch(() => {});
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
