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
    const url = new URL(req.url);
    const audioUrl = url.searchParams.get('url');
    const download = url.searchParams.get('download') === '1';
    const filenameParam = url.searchParams.get('filename') || 'call_audio.mp3';

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Proxying audio from:', audioUrl);

    // Fetch the audio from the source
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AudioProxy/1.0)',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch audio:', response.status, response.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch audio', status: response.status }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get content type from response or default to audio/wav
    const contentType = response.headers.get('content-type') || 'audio/wav';
    const contentLength = response.headers.get('content-length');

    // Stream the audio back
    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    };

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    console.log('Streaming audio, content-type:', contentType);

    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error: unknown) {
    console.error('Audio proxy error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
