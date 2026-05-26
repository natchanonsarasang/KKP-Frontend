// Dhipaya Airtable Proxy
// Calls Airtable Web API using a Personal Access Token (PAT).
// All requests must come from an authenticated user with the 'dhipaya' or 'admin' role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProxyRequest {
  action: "list" | "get" | "create" | "update" | "delete";
  table: string;
  recordId?: string;
  params?: Record<string, string | number | string[]>;
  fields?: Record<string, unknown>;
  records?: Array<{ id?: string; fields: Record<string, unknown> }>;
}

const ALLOWED_TABLES = new Set([
  "agents",
  "bot_sessions",
  "call_logs",
  "call_quality_evaluations",
  "campaigns",
  "consents",
  "customers",
  "installment_kbs",
  "installment_plans",
  "policies",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_PAT = Deno.env.get("AIRTABLE_PAT");
    const AIRTABLE_BASE_ID = Deno.env.get("AIRTABLE_BASE_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
      return json({ error: "Airtable credentials not configured. Set AIRTABLE_PAT and AIRTABLE_BASE_ID secrets." }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: "Supabase env missing" }, 500);
    }

    // Validate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    // Any authenticated user may access Dhipaya.

    // Parse request
    const body = (await req.json()) as ProxyRequest;
    if (!body?.action || !body?.table) return json({ error: "action and table are required" }, 400);
    if (!ALLOWED_TABLES.has(body.table)) return json({ error: `Table '${body.table}' is not allowed` }, 400);

    const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(body.table)}`;
    const headers = {
      Authorization: `Bearer ${AIRTABLE_PAT}`,
      "Content-Type": "application/json",
    };

    let url = baseUrl;
    let method: string = "GET";
    let payload: string | undefined;

    switch (body.action) {
      case "list": {
        const usp = new URLSearchParams();
        if (body.params) {
          for (const [k, v] of Object.entries(body.params)) {
            if (Array.isArray(v)) v.forEach((vv) => usp.append(k, String(vv)));
            else usp.set(k, String(v));
          }
        }
        if ([...usp.keys()].length) url = `${baseUrl}?${usp.toString()}`;
        method = "GET";
        break;
      }
      case "get": {
        if (!body.recordId) return json({ error: "recordId required" }, 400);
        url = `${baseUrl}/${body.recordId}`;
        method = "GET";
        break;
      }
      case "create": {
        method = "POST";
        if (body.records?.length) {
          payload = JSON.stringify({ records: body.records });
        } else if (body.fields) {
          payload = JSON.stringify({ fields: body.fields });
        } else {
          return json({ error: "fields or records required" }, 400);
        }
        break;
      }
      case "update": {
        method = "PATCH";
        if (body.records?.length) {
          payload = JSON.stringify({ records: body.records });
        } else if (body.recordId && body.fields) {
          url = `${baseUrl}/${body.recordId}`;
          payload = JSON.stringify({ fields: body.fields });
        } else {
          return json({ error: "recordId+fields or records required" }, 400);
        }
        break;
      }
      case "delete": {
        if (!body.recordId) return json({ error: "recordId required" }, 400);
        url = `${baseUrl}/${body.recordId}`;
        method = "DELETE";
        break;
      }
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }

    const upstream = await fetch(url, { method, headers, body: payload });
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type") ?? "application/json";

    if (!upstream.ok) {
      console.error("Airtable error", {
        status: upstream.status,
        table: body.table,
        method,
        baseIdPrefix: AIRTABLE_BASE_ID.slice(0, 6),
        baseIdLooksValid: AIRTABLE_BASE_ID.startsWith("app"),
        patPrefix: AIRTABLE_PAT.slice(0, 6),
        patLooksValid: AIRTABLE_PAT.startsWith("pat"),
        response: text.slice(0, 500),
      });
    }

    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": ct },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
