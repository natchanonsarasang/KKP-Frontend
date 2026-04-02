import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Parsing debtor query:", query);

    const systemPrompt = `You are a query parser for a debt collection system. Convert natural language queries into structured filter conditions.

Available filter fields:
- minDebt: minimum debt amount (number)
- maxDebt: maximum debt amount (number)
- minPickedUp: minimum times the debtor picked up calls (number)
- maxPickedUp: maximum times the debtor picked up calls (number)
- minNotPickedUp: minimum times the debtor didn't pick up (number)
- maxNotPickedUp: maximum times the debtor didn't pick up (number)
- minAccepted: minimum times debtor accepted payment terms (number)
- maxAccepted: maximum times debtor accepted payment terms (number)
- minRejected: minimum times debtor rejected payment terms (number)
- maxRejected: maximum times debtor rejected payment terms (number)
- status: debtor status (string: "active", "pending", "overdue")

Examples:
- "debt above 5000" → {"minDebt": 5000}
- "never picked up" → {"maxPickedUp": 0}
- "picked up at least once" → {"minPickedUp": 1}
- "picked up less than 2 times" → {"maxPickedUp": 1}
- "high value debtors who never answered" → {"minDebt": 10000, "maxPickedUp": 0}
- "overdue debtors with debt between 1000 and 5000" → {"minDebt": 1000, "maxDebt": 5000, "status": "overdue"}

Return ONLY a valid JSON object with the conditions. No explanations.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_filter_conditions",
              description: "Set the filter conditions for querying debtors",
              parameters: {
                type: "object",
              properties: {
                  minDebt: { type: "number", description: "Minimum debt amount" },
                  maxDebt: { type: "number", description: "Maximum debt amount" },
                  minPickedUp: { type: "number", description: "Minimum picked up count" },
                  maxPickedUp: { type: "number", description: "Maximum picked up count" },
                  minNotPickedUp: { type: "number", description: "Minimum not picked up count" },
                  maxNotPickedUp: { type: "number", description: "Maximum not picked up count" },
                  minAccepted: { type: "number", description: "Minimum accepted count" },
                  maxAccepted: { type: "number", description: "Maximum accepted count" },
                  minRejected: { type: "number", description: "Minimum rejected count" },
                  maxRejected: { type: "number", description: "Maximum rejected count" },
                  status: { type: "string", enum: ["active", "pending", "overdue"], description: "Debtor status" }
                },
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "set_filter_conditions" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data));

    // Extract conditions from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const conditions = JSON.parse(toolCall.function.arguments);
      console.log("Parsed conditions:", conditions);
      
      return new Response(JSON.stringify({ conditions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const conditions = JSON.parse(content);
        return new Response(JSON.stringify({ conditions }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        console.error("Failed to parse content as JSON:", content);
      }
    }

    return new Response(JSON.stringify({ error: "Could not parse query" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in parse-debtor-query:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
