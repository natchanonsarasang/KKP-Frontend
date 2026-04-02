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
    const BOT_ID = "69ccce0db875327d960ef0cf";
    const CALL_API_URL = "https://bn-voicebot-system.onrender.com/api/voicebot/custom/call_message_public";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking for scheduled call list items...");

    const now = new Date().toISOString();
    
    // Get pending call list items that are scheduled for now or earlier
    const { data: pendingItems, error: fetchError } = await supabase
      .from("call_list_items")
      .select("*")
      .eq("status", "pending")
      .or(`scheduled_at.is.null,scheduled_at.lte.${now}`);

    if (fetchError) {
      console.error("Error fetching call list items:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingItems?.length || 0} pending call list items`);

    if (!pendingItems || pendingItems.length === 0) {
      return new Response(
        JSON.stringify({ message: "No scheduled calls due", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get debtor IDs
    const debtorIds = [...new Set(pendingItems.map(item => item.debtor_id))];
    
    // Fetch debtors
    const { data: debtors } = await supabase
      .from("debtors")
      .select("*")
      .in("id", debtorIds);

    const debtorMap = new Map(debtors?.map(d => [d.id, d]) || []);

    // Get template IDs and fetch templates
    const templateIds = [...new Set(pendingItems.map(item => item.template_id).filter(Boolean))];
    const { data: templates } = await supabase
      .from("call_templates")
      .select("*")
      .in("id", templateIds);

    const templateMap = new Map(templates?.map(t => [t.id, t]) || []);

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
      if (!template || !template.template_id) {
        console.log(`Template not found for item ${item.id}`);
        await supabase
          .from("call_list_items")
          .update({ status: "failed", notes: "Template not found" })
          .eq("id", item.id);
        results.push({ id: item.id, success: false, error: "Template not found" });
        continue;
      }

      console.log(`Processing call for: ${debtor.phone_number}`);

      try {
        // Update call list item to calling
        await supabase
          .from("call_list_items")
          .update({ status: "calling", called_at: now })
          .eq("id", item.id);

        // Create call record
        const { data: callRecord, error: insertError } = await supabase
          .from("call_records")
          .insert({
            phone_number: debtor.phone_number,
            amount: debtor.total_debt?.toString() || "",
            due_date: debtor.due_date,
            status: "calling",
            template_id: template.id,
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
        await supabase
          .from("call_list_items")
          .update({ call_record_id: callRecord.id })
          .eq("id", item.id);

        // Make the call via Botnoi API
        if (botnoiApiToken) {
          // Build message from debtor variables
          const debtorVars = debtor.variables || {};
          const messageTemplate = debtorVars.message_template || 
            "สวัสดีค่ะ คุณมียอดค้างชำระจำนวน {debt} และมีกำหนดชำระในวันที่ {due_date} ไม่ทราบว่าสามารถชำระได้ก่อนวันครบกำหนดหรือไม่คะ";
          
          let appointmentMessage = messageTemplate;
          if (debtor.total_debt) {
            appointmentMessage = appointmentMessage.replace(/\{debt\}/gi, `${debtor.total_debt}บาท`);
          }
          if (debtor.due_date) {
            const formattedDate = new Date(debtor.due_date).toLocaleDateString("th-TH", { 
              day: "numeric", month: "long", year: "numeric" 
            });
            appointmentMessage = appointmentMessage.replace(/\{due_date\}/gi, formattedDate);
          }

          const callPayload: Record<string, unknown> = {
            template_id: template.template_id,
            tel_no: debtor.phone_number,
            "Appointment Date": appointmentMessage,
          };

          const callResponse = await fetch("https://api.botnoi.ai/voice/outbound", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${botnoiApiToken}`,
            },
            body: JSON.stringify(callPayload),
          });

          const callData = await callResponse.json();
          console.log(`Botnoi response for ${debtor.phone_number}:`, callData);

          // Update call record with Botnoi ID
          await supabase
            .from("call_records")
            .update({
              botnoi_call_id: callData.outbound_id || null,
              status: callData.outbound_id ? "pending" : "failed",
            })
            .eq("id", callRecord.id);

          // Update call list item status
          if (!callData.outbound_id) {
            await supabase
              .from("call_list_items")
              .update({ status: "failed", notes: "No outbound_id returned" })
              .eq("id", item.id);
          }
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Scheduled calls error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
