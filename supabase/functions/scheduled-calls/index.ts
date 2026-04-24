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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BOT_ID = "69d7214db875327d960ef7ac";
    const CALL_API_URL = "https://bn-voicebot-system-9ehp.onrender.com/api/voicebot/custom/call_message_public";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get all active running sessions
    const { data: activeSessions, error: sessionError } = await supabase
      .from("call_sessions")
      .select("user_id, workspace_id")
      .eq("status", "running");

    if (sessionError) {
      console.error("Error fetching active sessions:", sessionError);
      throw sessionError;
    }

    console.log(`Found ${activeSessions?.length || 0} active running sessions`);

    if (!activeSessions || activeSessions.length === 0) {
      return new Response(JSON.stringify({ message: "No active sessions running", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get pending call list items that are scheduled for now or earlier
    // Also pick up pending_retry items whose next_retry_at has passed
    const { data: allPendingItems, error: fetchError } = await supabase
      .from("call_list_items")
      .select("*")
      .or(
        `and(status.eq.pending,scheduled_at.not.is.null,scheduled_at.lte.${now}),and(status.eq.pending_retry,next_retry_at.lte.${now})`,
      );

    if (fetchError) {
      console.error("Error fetching call list items:", fetchError);
      throw fetchError;
    }

    // 3. Filter pending items to only those belonging to active sessions
    const activeSessionKeys = new Set(activeSessions.map(s => `${s.user_id}:${s.workspace_id}`));
    const pendingItems = (allPendingItems || []).filter(item => 
      activeSessionKeys.has(`${item.user_id}:${item.workspace_id}`)
    );

    console.log(`Found ${pendingItems.length} eligible pending items after filtering by active sessions`);

    if (pendingItems.length === 0) {
      return new Response(JSON.stringify({ message: "No scheduled calls for active sessions", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get debtor IDs
    const debtorIds = [...new Set(pendingItems.map((item) => item.debtor_id))];

    // Fetch debtors
    const { data: debtors } = await supabase.from("debtors").select("*").in("id", debtorIds);

    const debtorMap = new Map(debtors?.map((d) => [d.id, d]) || []);

    // Get template IDs and fetch templates
    const templateIds = [...new Set(pendingItems.map((item) => item.template_id).filter(Boolean))];
    const { data: templates } = await supabase.from("call_templates").select("*").in("id", templateIds);

    const templateMap = new Map(templates?.map((t) => [t.id, t]) || []);

    // Get default template if needed
    const { data: defaultTemplates } = await supabase
      .from("call_templates")
      .select("*")
      .not("template_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const defaultTemplate = defaultTemplates?.[0];

    const results = [];

    for (const item of pendingItems) {
      const debtor = debtorMap.get(item.debtor_id);
      if (!debtor) {
        console.log(`Debtor not found for item ${item.id}`);
        await supabase
          .from("call_list_items")
          .update({ status: "failed", notes: "Debtor not found" })
          .eq("id", item.id);
        results.push({ id: item.id, success: false, error: "Debtor not found" });
        continue;
      }

      const template = item.template_id ? templateMap.get(item.template_id) : defaultTemplate;

      console.log(`Processing call for: ${debtor.phone_number}`);

      try {
        // Update call list item to calling
        await supabase.from("call_list_items").update({ status: "calling", called_at: now }).eq("id", item.id);

        // Create call record
        const { data: callRecord, error: insertError } = await supabase
          .from("call_records")
          .insert({
            phone_number: debtor.phone_number,
            amount: debtor.total_debt?.toString() || "",
            due_date: debtor.due_date,
            status: "calling",
            template_id: template?.id || null,
            user_id: item.user_id,
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error creating call record for ${debtor.phone_number}:`, insertError);
          await supabase
            .from("call_list_items")
            .update({ status: "failed", notes: insertError.message })
            .eq("id", item.id);
          results.push({ phone: debtor.phone_number, success: false, error: insertError.message });
          continue;
        }

        // Link call record to call list item
        await supabase.from("call_list_items").update({ call_record_id: callRecord.id }).eq("id", item.id);

        // Make the call via new Voicebot API
        const debtorVars = debtor.variables || {};

        const callPayload = {
          bot_id: BOT_ID,
          bot_type: "Confirm1",
          tel_number: debtor.phone_number,
          variables: debtorVars,
          asr: {
            asr_provider: "botnoi-aws-th-noise-classifier-v17c",
            asr_timeout: 5
          },
          interruptible: "True",
          vad: {
            false_timeout_sec: "5",
            false_silence_sec: "0.1",
            true_silence_sec: "0.25",
          },

        };

        const callResponse = await fetch(CALL_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(callPayload),
        });

        const callData = await callResponse.json();
        console.log(`Voicebot response for ${debtor.phone_number}:`, callData);

        // Update call record with call ID
        const callId = callData.outbound_id || callData.call_id || null;
        await supabase
          .from("call_records")
          .update({
            botnoi_call_id: callId,
            status: callResponse.ok ? "pending" : "failed",
          })
          .eq("id", callRecord.id);

        // Update call list item status
        if (!callResponse.ok) {
          await supabase
            .from("call_list_items")
            .update({ status: "failed", notes: "API call failed" })
            .eq("id", item.id);
        }

        // Update debtor contact attempts
        await supabase
          .from("debtors")
          .update({
            contact_attempts: (debtor.contact_attempts || 0) + 1,
            last_contact_at: now,
          })
          .eq("id", debtor.id);

        results.push({ phone: debtor.phone_number, success: true });
        console.log(`Successfully initiated call for ${debtor.phone_number}`);
      } catch (callError) {
        console.error(`Error processing ${debtor.phone_number}:`, callError);
        await supabase
          .from("call_list_items")
          .update({ status: "failed", notes: String(callError) })
          .eq("id", item.id);
        results.push({ phone: debtor.phone_number, success: false, error: String(callError) });
      }
    }

    const successful = results.filter((r) => r.success).length;
    console.log(`Completed: ${successful}/${results.length} calls initiated`);

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} scheduled calls`,
        successful,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Scheduled calls error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
