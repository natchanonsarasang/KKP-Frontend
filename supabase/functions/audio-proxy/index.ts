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

    // Try fetching the audio from the source. Some buckets need a Referer.
    let response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://voicebot.botnoi.ai/',
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      // Retry without referer
      response = await fetch(audioUrl);
    }

    if (!response.ok) {
      console.error('Failed to fetch audio:', response.status, response.statusText);
      return new Response(
        JSON.stringify({
          error: 'Audio source is not accessible',
          status: response.status,
          detail: 'The upstream audio file is private or expired and cannot be downloaded.',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Detect actual format from URL extension; default to wav (what voicebot returns)
    const lowerUrl = audioUrl.toLowerCase();
    const isWav = lowerUrl.includes('.wav');
    const sourceContentType = response.headers.get('content-type') || (isWav ? 'audio/wav' : 'audio/mpeg');
    const contentLength = response.headers.get('content-length');

    // Read full body so we return a real binary file (not a stream that may break mid-download)
    const audioBuffer = await response.arrayBuffer();

    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': sourceContentType,
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': String(audioBuffer.byteLength),
    };

    if (download) {
      // Force the filename extension to match the actual binary format
      let safeName = filenameParam.replace(/[^a-zA-Z0-9._-]/g, '_');
      const desiredExt = isWav ? '.wav' : '.mp3';
      if (!safeName.toLowerCase().endsWith(desiredExt)) {
        safeName = safeName.replace(/\.(mp3|wav|m4a|ogg)$/i, '') + desiredExt;
      }
      headers['Content-Disposition'] = `attachment; filename="${safeName}"`;
    }

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    console.log('Returning audio binary, content-type:', sourceContentType, 'bytes:', audioBuffer.byteLength);

    return new Response(audioBuffer, {
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
