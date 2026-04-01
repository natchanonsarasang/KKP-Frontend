import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { confirm_message, decline_message, fallback_message, org_name, speaker_id } = await req.json();

    const botnoiToken = Deno.env.get('BOTNOI_API_TOKEN');
    if (!botnoiToken) {
      throw new Error('BOTNOI_API_TOKEN not configured');
    }

    console.log('Creating template with Botnoi API...');
    
    // Register with {Appointment Date} as the only variable placeholder
    // The actual message will be packed into this parameter at call time
    const botnoiMessage = '{Appointment Date}';
    
    console.log('Payload:', { message: botnoiMessage, confirm_message, decline_message, fallback_message, org_name, speaker_id });

    const response = await fetch('https://api-voice.botnoi.ai/api/voicebot/confirm/create_template', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'botnoi-token': botnoiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: botnoiMessage,
        confirm_message,
        decline_message,
        fallback_message,
        org_name: org_name || 'บอทน้อย',
        speaker_id: speaker_id || '523',
      }),
    });

    const data = await response.json();
    console.log('Botnoi API response:', data);

    if (!response.ok) {
      throw new Error(`Botnoi API error: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error creating template:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});