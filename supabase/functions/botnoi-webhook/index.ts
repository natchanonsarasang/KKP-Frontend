import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log('Received webhook payload:', JSON.stringify(payload, null, 2));

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Function to categorize conversation using Lovable AI
    const categorizeConversation = async (log: string, status: string): Promise<string> => {
      // 1. Check system-level statuses first
      if (status === 'no_answer' || status === 'busy' || status === 'unreachable') {
        return "ไม่รับสาย → โทรรอบ 2";
      }
      
      if (status === 'failed' || status === 'error') {
        return "โทรแล้วปิดเครื่อง";
      }

      // 2. If no log, and status is completed, it might be "ลูกค้าไม่พูด"
      if (!log || log.trim().length < 5) {
        if (status === 'completed') return "ลูกค้าไม่พูด";
        return "ไม่รับสาย → โทรรอบ 2";
      }

      // 3. For behavioral categories, use Lovable AI
      if (!LOVABLE_API_KEY) {
        console.warn('LOVABLE_API_KEY not found, skipping AI categorization');
        return "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)";
      }

      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              {
                role: 'system',
                content: `You are an AI that categorizes debt collection call transcripts into one of these 13 categories in Thai:
1. ลูกค้าอยู่ที่เสียงดัง (Noisy environment)
2. ลูกค้าอยู่ข้างทาง / ไม่สะดวก (Inconvenient/Roadside)
3. ลูกค้าไม่ยอมจ่าย (เงียบ / พูดแทรก) (Refuses to pay/Silent/Interrupts)
4. ลูกค้าสนใจปรับโครงสร้างหนี้ (Interested in debt restructuring)
5. ลูกค้าขอคุยกับเจ้าหน้าที่ (Wants to talk to an agent)
6. ลูกค่ายอมจ่าย + บอกวันที่ (Agrees to pay + date)
7. ลูกค่ายอมจ่าย แต่ไม่บอกวันที่ (Agrees to pay but no date)
8. ไม่รับสาย → โทรรอบ 2 (System result: No answer)
9. ไม่อยากคุยกับ Bot (Refuses to talk to bot)
10. ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต) (Irrelevant topics/Flood/Death)
11. ลูกค้าพูดภาษาถิ่น (Local dialect)
12. ลูกค้าไม่พูด (Silent customer)
13. โทรแล้วปิดเครื่อง (System result: Failed/Phone off)

Return ONLY the category name as a string, nothing else.`
              },
              {
                role: 'user',
                content: `Analyze this transcript: "${log}"`
              }
            ],
            temperature: 0,
          }),
        });

        if (!response.ok) {
          console.error('Lovable AI error:', response.status, await response.text());
          return "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)";
        }

        const result = await response.json();
        const category = result.choices?.[0]?.message?.content?.trim();
        
        const AICATEGORIES = [
          "ลูกค้าอยู่ที่เสียงดัง",
          "ลูกค้าอยู่ข้างทาง / ไม่สะดวก",
          "ลูกค้าไม่ยอมจ่าย (เงียบ / พูดแทรก)",
          "ลูกค้าสนใจปรับโครงสร้างหนี้",
          "ลูกค้าขอคุยกับเจ้าหน้าที่",
          "ลูกค่ายอมจ่าย + บอกวันที่",
          "ลูกค่ายอมจ่าย แต่ไม่บอกวันที่",
          "ไม่รับสาย → โทรรอบ 2",
          "ไม่อยากคุยกับ Bot",
          "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)",
          "ลูกค้าพูดภาษาถิ่น",
          "ลูกค้าไม่พูด",
          "โทรแล้วปิดเครื่อง"
        ];

        if (category && AICATEGORIES.includes(category)) {
          return category;
        }

        for (const allowedCat of AICATEGORIES) {
          if (category?.includes(allowedCat)) return allowedCat;
        }

        return "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)";
      } catch (err) {
        console.error('Error calling Lovable AI:', err);
        return "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)";
      }
    };

    // Extract call result data from webhook
    const callId = payload.outbound_id || payload.call_id || payload.callId;
    const status = payload.status;
    const action = payload.action; // User's actual response: Confirm, Decline, No, Unknown
    let phoneNumber = payload.phone_number || payload['Tel. Number'];

    // Extract phone from audio_url if not provided (format: ..._PHONE.wav)
    if (!phoneNumber && payload.audio_url) {
      const match = payload.audio_url.match(/_(\d+)\.wav$/);
      if (match) {
        phoneNumber = match[1];
      }
    }

    console.log('Extracted data:', { callId, status, action, phoneNumber });

    if (callId || phoneNumber) {
      // Map Botnoi action to our status (action is the user's response)
      let mappedStatus = 'pending';
      
      if (action === 'Confirm' || action === 'confirm' || action === 'yes' || action === 'Yes') {
        mappedStatus = 'confirmed';
      } else if (action === 'Decline' || action === 'decline' || action === 'no' || action === 'No') {
        mappedStatus = 'declined';
      } else if (action === 'Unknown' || action === 'unknown') {
        mappedStatus = 'no_response';
      } else if (status === 'failed' || status === 'error') {
        mappedStatus = 'failed';
      } else if (status === 'no_answer' || status === 'busy' || status === 'unreachable') {
        mappedStatus = 'no_answer';
      } else if (status === 'completed') {
        mappedStatus = 'completed';
      }

      console.log('Mapped status:', mappedStatus);

      // Map action to English outcome text
      let callOutcome = 'Unknown';
      if (mappedStatus === 'confirmed') {
        callOutcome = 'Confirmed';
      } else if (mappedStatus === 'declined') {
        callOutcome = 'Declined';
      } else if (mappedStatus === 'no_response') {
        callOutcome = 'No Response';
      } else if (mappedStatus === 'no_answer') {
        callOutcome = 'No Answer';
      } else if (mappedStatus === 'completed') {
        callOutcome = 'Completed';
      }

      const pickedUp = mappedStatus === 'confirmed' || mappedStatus === 'declined' || mappedStatus === 'no_response';
      const audioUrl = payload.audio_url || null;
      const conversationLog = payload.conversation_log || payload.transcript || payload.transcription || null;
      const callDuration = payload.duration || payload.call_duration || payload.talk_time || null;

      console.log('Audio URL:', audioUrl);
      console.log('Conversation Log:', conversationLog);
      console.log('Picked up:', pickedUp);

      // Perform AI categorization
      const aiCategory = await categorizeConversation(conversationLog || '', status);
      console.log('AI Category:', aiCategory);

      // Determine token deduction: 4 tokens if picked up, 1 token if not picked up
      const tokensToDeduct = pickedUp ? 4 : 1;

      // --- Resolve user_id and workspace_id ---
      // Try to find from existing call_record first, then fall back to first workspace owner
      let resolvedUserId: string | null = null;
      let resolvedWorkspaceId: string | null = null;

      // Check if there's already a call_record with this callId that has user/workspace
      if (callId) {
        const { data: existingRecord } = await supabase
          .from('call_records')
          .select('user_id, workspace_id, phone_number')
          .eq('botnoi_call_id', callId)
          .maybeSingle();
        
        if (existingRecord) {
          resolvedUserId = existingRecord.user_id;
          resolvedWorkspaceId = existingRecord.workspace_id;
          if (!phoneNumber && existingRecord.phone_number) {
            phoneNumber = existingRecord.phone_number;
          }
        }
      }

      // If still no user, check debtor ownership
      if (!resolvedUserId && phoneNumber) {
        const { data: existingDebtor } = await supabase
          .from('debtors')
          .select('user_id, workspace_id')
          .eq('phone_number', phoneNumber)
          .not('user_id', 'is', null)
          .limit(1)
          .maybeSingle();

        if (existingDebtor) {
          resolvedUserId = existingDebtor.user_id;
          resolvedWorkspaceId = existingDebtor.workspace_id;
        }
      }

      // Last resort: use the first workspace owner
      if (!resolvedUserId) {
        const { data: firstWorkspace } = await supabase
          .from('workspaces')
          .select('id, owner_id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstWorkspace) {
          resolvedUserId = firstWorkspace.owner_id;
          resolvedWorkspaceId = firstWorkspace.id;
        }
      }

      console.log('Resolved owner:', { resolvedUserId, resolvedWorkspaceId });

      // 1. Update or create call record by call ID
      let callRecordId: string | null = null;
      if (callId) {
        const { data: callRecord } = await supabase
          .from('call_records')
          .select('id, phone_number')
          .eq('botnoi_call_id', callId)
          .maybeSingle();

        if (callRecord) {
          callRecordId = callRecord.id;
          const { error } = await supabase
            .from('call_records')
            .update({
              status: mappedStatus,
              result_data: payload,
              call_duration: callDuration ? Math.round(Number(callDuration)) : null,
              user_id: resolvedUserId,
              workspace_id: resolvedWorkspaceId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', callRecord.id);

          if (error) {
            console.error('Error updating call record:', error);
          } else {
            console.log('Call record updated successfully');
          }
        } else if (phoneNumber) {
          console.log('Auto-creating call_record for botnoi_call_id:', callId);
          const { data: newRecord, error: insertError } = await supabase
            .from('call_records')
            .insert({
              botnoi_call_id: callId,
              phone_number: phoneNumber,
              status: mappedStatus,
              result_data: payload,
              call_duration: callDuration ? Math.round(Number(callDuration)) : null,
              appointment_date: payload.appointment_date || null,
              appointment_time: payload.appointment_time || null,
              user_id: resolvedUserId,
              workspace_id: resolvedWorkspaceId,
            })
            .select('id')
            .single();

          if (insertError) {
            console.error('Error auto-creating call record:', insertError);
          } else {
            callRecordId = newRecord?.id || null;
            console.log('Call record auto-created:', callRecordId);
          }
        }
      }

      // 2. Find or create debtor, then update/create call_list_items
      if (phoneNumber) {
        let debtorId: string | null = null;

        // Find existing debtor
        const { data: existingDebtors } = await supabase
          .from('debtors')
          .select('id, user_id, workspace_id')
          .eq('phone_number', phoneNumber)
          .limit(1)
          .maybeSingle();

        if (existingDebtors) {
          debtorId = existingDebtors.id;
        } else {
          // Auto-create debtor
          console.log('Auto-creating debtor for phone:', phoneNumber);
          const { data: newDebtor, error: createDebtorError } = await supabase
            .from('debtors')
            .insert({
              phone_number: phoneNumber,
              status: 'active',
              call_outcome: callOutcome,
              call_answered: pickedUp,
              last_contact_at: new Date().toISOString(),
              picked_up_count: pickedUp ? 1 : 0,
              not_picked_up_count: pickedUp ? 0 : 1,
              contact_attempts: 1,
              user_id: resolvedUserId,
              workspace_id: resolvedWorkspaceId,
            })
            .select('id')
            .single();

          if (createDebtorError) {
            console.error('Error auto-creating debtor:', createDebtorError);
          } else {
            debtorId = newDebtor?.id || null;
            console.log('Debtor auto-created:', debtorId);
          }
        }

        // Now handle call_list_items
        if (debtorId && resolvedUserId) {
          // Try to find existing calling item
          const { data: recentItem } = await supabase
            .from('call_list_items')
            .select('id')
            .eq('debtor_id', debtorId)
            .eq('status', 'calling')
            .order('called_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const finalStatus = pickedUp ? 'success' : mappedStatus;
          const notesData = JSON.stringify({ 
            audio_url: audioUrl, 
            conversation_log: conversationLog 
          });

          if (recentItem) {
            // Update existing item
            const { error: cliError } = await supabase
              .from('call_list_items')
              .update({
                status: finalStatus,
                call_outcome: callOutcome,
                picked_up: pickedUp,
                notes: notesData,
                call_record_id: callRecordId,
                ai_category: aiCategory,
                updated_at: new Date().toISOString(),
              })
              .eq('id', recentItem.id);

            if (cliError) {
              console.error('Error updating call_list_item:', cliError);
            } else {
              console.log('Call list item updated:', recentItem.id);
            }
          } else {
            // Auto-create call_list_item so Analytics can see the data
            console.log('Auto-creating call_list_item for debtor:', debtorId);
            const { error: createCliError } = await supabase
              .from('call_list_items')
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
              });

            if (createCliError) {
              console.error('Error auto-creating call_list_item:', createCliError);
            } else {
              console.log('Call list item auto-created');
            }
          }

          // Deduct tokens
          console.log(`Deducting ${tokensToDeduct} tokens for user ${resolvedUserId}`);
          const { error: deductError } = await supabase
            .rpc('deduct_tokens', { p_user_id: resolvedUserId, p_amount: tokensToDeduct });
          if (deductError) {
            console.error('Error deducting tokens:', deductError);
          }
        }

        // 3. Update debtor stats based on call result
        if (status === 'completed') {
          // Get current debtor data (use first debtor if multiple)
          const { data: debtor } = await supabase
            .from('debtors')
            .select('id, picked_up_count, accept_count, reject_count, other_count')
            .eq('phone_number', phoneNumber)
            .order('created_at', { ascending: false })
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
            }

            // Update accept/reject/other based on action
            if (mappedStatus === 'confirmed') {
              updateData.accept_count = (debtor.accept_count || 0) + 1;
              updateData.last_response = 'accept';
            } else if (mappedStatus === 'declined') {
              updateData.reject_count = (debtor.reject_count || 0) + 1;
              updateData.last_response = 'reject';
            } else if (mappedStatus === 'no_response') {
              updateData.other_count = (debtor.other_count || 0) + 1;
              updateData.last_response = 'unknown';
            }

            console.log('Updating debtor with:', updateData);

            const { error: debtorError } = await supabase
              .from('debtors')
              .update(updateData)
              .eq('id', debtor.id);

            if (debtorError) {
              console.error('Error updating debtor stats:', debtorError);
            } else {
              console.log('Debtor stats updated successfully');
            }
          } else {
            console.log('Debtor not found for phone:', phoneNumber);
          }
        } else if (status === 'no_answer' || status === 'busy' || status === 'unreachable') {
          // Update not picked up count
          const { data: debtor } = await supabase
            .from('debtors')
            .select('id, not_picked_up_count')
            .eq('phone_number', phoneNumber)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (debtor) {
            const { error: debtorError } = await supabase
              .from('debtors')
              .update({
                not_picked_up_count: (debtor.not_picked_up_count || 0) + 1,
                updated_at: new Date().toISOString(),
                call_answered: false,
              })
              .eq('id', debtor.id);

            if (debtorError) {
              console.error('Error updating debtor not_picked_up_count:', debtorError);
            } else {
              console.log('Debtor not_picked_up_count updated');
            }
          }
        }
      }

      // After processing, trigger next call if there's an active session
      // Find active session for this workspace
      const { data: activeSessions } = await supabase
        .from('call_sessions')
        .select('id, workspace_id, user_id')
        .eq('status', 'running')
        .limit(10);

      if (activeSessions && activeSessions.length > 0) {
        // Trigger process-call-session for each active session
        for (const session of activeSessions) {
          console.log(`Triggering next call for session ${session.id}`);
          
          // Use EdgeRuntime.waitUntil if available for background processing
          const triggerNextCall = async () => {
            try {
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
              const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
              
              await fetch(`${supabaseUrl}/functions/v1/process-call-session`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({ 
                  action: 'continue',
                  session_id: session.id 
                }),
              });
            } catch (err) {
              console.error('Error triggering next call:', err);
            }
          };

          // Fire and forget - don't await
          triggerNextCall();
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
