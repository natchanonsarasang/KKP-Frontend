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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    // Function to categorize conversation using AI
    const categorizeConversation = async (log: string, status: string): Promise<string> => {
      // 1. Check system-level statuses first
      if (status === 'no_answer' || status === 'busy' || status === 'unreachable') {
        return "ไม่รับสาย → โทรรอบ 2";
      }
      
      if (status === 'failed' || status === 'error') {
        return "โทรแล้วปิดเครื่อง";
      }

      // 2. If no log, and status is completed, it might be "ลูกค้าไม่พูด" or "เงียบ"
      if (!log || log.trim().length < 5) {
        if (status === 'completed') return "ลูกค้าไม่พูด";
        return "ไม่รับสาย → โทรรอบ 2";
      }

      // 3. For behavioral categories, use OpenAI
      if (!OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY not found, skipping AI categorization');
        return "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)";
      }

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
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

        const result = await response.json();
        const category = result.choices?.[0]?.message?.content?.trim();
        
        // Ensure the returned category is one of the allowed ones
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

        // Fallback or fuzzy match
        for (const allowedCat of AICATEGORIES) {
          if (category?.includes(allowedCat)) return allowedCat;
        }

        return "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)";
      } catch (err) {
        console.error('Error calling OpenAI:', err);
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

      // 1. Update call record by call ID (outbound_id from Botnoi) and get phone number
      if (callId) {
        // First, get the call record to find the phone number
        const { data: callRecord, error: fetchError } = await supabase
          .from('call_records')
          .select('id, phone_number')
          .eq('botnoi_call_id', callId)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching call record:', fetchError);
        } else if (callRecord) {
          // Use phone number from call record if not provided in webhook
          if (!phoneNumber && callRecord.phone_number) {
            phoneNumber = callRecord.phone_number;
            console.log('Phone number retrieved from call_record:', phoneNumber);
          }

          // Now update the call record
          const { error } = await supabase
            .from('call_records')
            .update({
              status: mappedStatus,
              result_data: payload,
              call_duration: callDuration ? Math.round(Number(callDuration)) : null,
              ai_category: aiCategory,
              updated_at: new Date().toISOString(),
            })
            .eq('id', callRecord.id);

          if (error) {
            console.error('Error updating call record:', error);
          } else {
            console.log('Call record updated successfully');
          }
        } else {
          console.log('No call record found for botnoi_call_id:', callId);
        }
      }

      // 2. Update call_list_items - find the most recent one for this phone
      if (phoneNumber) {
        // First, find all debtors with this phone number
        const { data: debtors, error: debtorFetchError } = await supabase
          .from('debtors')
          .select('id')
          .eq('phone_number', phoneNumber);

        if (debtorFetchError) {
          console.error('Error fetching debtors:', debtorFetchError);
        } else if (debtors && debtors.length > 0) {
          const debtorIds = debtors.map(d => d.id);
          console.log('Found debtor IDs:', debtorIds);

          // Find the most recent call_list_item that's in "calling" status (call was initiated, awaiting result)
          const { data: recentItem, error: fetchError } = await supabase
            .from('call_list_items')
            .select('id')
            .in('debtor_id', debtorIds)
            .eq('status', 'calling')
            .order('called_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fetchError) {
            console.error('Error fetching call_list_item:', fetchError);
          } else if (recentItem) {
            // Now update by ID - store status as Success if picked up
            // Store audio URL and conversation log as JSON in notes field
            const finalStatus = pickedUp ? 'success' : mappedStatus;
            const notesData = JSON.stringify({ 
              audio_url: audioUrl, 
              conversation_log: conversationLog 
            });
            
            const { error: cliError } = await supabase
              .from('call_list_items')
              .update({
                status: finalStatus,
                call_outcome: callOutcome,
                picked_up: pickedUp,
                notes: notesData, // Store audio URL and transcription as JSON
                ai_category: aiCategory,
                updated_at: new Date().toISOString(),
              })
              .eq('id', recentItem.id);

            if (cliError) {
              console.error('Error updating call_list_item:', cliError);
            } else {
              console.log('Call list item updated successfully:', recentItem.id);
              
              // Deduct tokens based on call outcome
              // Get the user_id from the call_list_item to deduct tokens
              const { data: callItem } = await supabase
                .from('call_list_items')
                .select('user_id')
                .eq('id', recentItem.id)
                .single();
              
              if (callItem?.user_id) {
                console.log(`Deducting ${tokensToDeduct} tokens for user ${callItem.user_id} (picked_up: ${pickedUp})`);
                
                const { data: deductResult, error: deductError } = await supabase
                  .rpc('deduct_tokens', { p_user_id: callItem.user_id, p_amount: tokensToDeduct });
                
                if (deductError) {
                  console.error('Error deducting tokens:', deductError);
                } else {
                  console.log(`Token deduction result: ${deductResult}`);
                  
                  // Update tokens_used in the active call session
                  const { data: activeSession } = await supabase
                    .from('call_sessions')
                    .select('id, tokens_used')
                    .eq('user_id', callItem.user_id)
                    .eq('status', 'running')
                    .order('started_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  
                  if (activeSession) {
                    const newTokensUsed = (activeSession.tokens_used || 0) + tokensToDeduct;
                    await supabase
                      .from('call_sessions')
                      .update({ tokens_used: newTokensUsed })
                      .eq('id', activeSession.id);
                    console.log(`Updated session ${activeSession.id} tokens_used to ${newTokensUsed}`);
                  }
                }
              }
            }
          } else {
            console.log('No pending call_list_item found for debtor');
          }
        } else {
          console.log('No debtors found with phone:', phoneNumber);
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
