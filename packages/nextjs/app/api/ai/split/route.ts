import { NextRequest } from "next/server";

export const runtime = "nodejs";

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
const KIMI_MODEL = process.env.KIMI_MODEL || "moonshot-v1-8k";

const MIN_AMOUNT = 0.001;
const MAX_MILESTONES = 8;
const MIN_MILESTONES = 2;

type SplitRequest = {
  description: string;
  budget?: number;
  level?: "solo" | "agent" | "team";
  durationDays?: number;
};

type StreamMilestone = {
  description: string;
  acceptance: string;
  amount: number;
};

function systemPrompt(budget: number | undefined, currency: string): string {
  const budgetRule = budget
    ? `The amounts you assign MUST sum to exactly ${budget} ${currency}. Distribute the budget across milestones in proportion to effort.`
    : `Estimate a reasonable total budget in ${currency} based on the scope, then split it across milestones.`;

  return [
    "You are a project planning assistant for a milestone-based escrow dApp.",
    `Break the user's project description into ${MIN_MILESTONES}-${MAX_MILESTONES} sequential milestones.`,
    "",
    "OUTPUT FORMAT (STRICT):",
    "- Output ONLY JSON Lines: one JSON object per line, no markdown, no prose, no code fences.",
    "- Each line is a valid JSON object with keys: description (string), acceptance (string), amount (number).",
    "- Emit one object per line. Do not wrap in an array.",
    "- description: short imperative phrase, e.g. 'Design wireframes and mockups'.",
    "- acceptance: 1-3 concrete, verifiable acceptance criteria as a single string (use ' / ' to separate).",
    `- amount: a number in ${currency}, must be >= ${MIN_AMOUNT}.`,
    "",
    "BUDGET:",
    `- ${budgetRule}`,
    "",
    "Do not include any text other than the JSON lines.",
  ].join("\n");
}

function userPrompt(req: SplitRequest, currency: string): string {
  const parts = [`Project description:\n${req.description}`];
  if (req.budget) parts.push(`Target budget: ${req.budget} ${currency}`);
  if (req.level) parts.push(`Team profile: ${req.level}`);
  if (req.durationDays) parts.push(`Expected duration: ${req.durationDays} days`);
  return parts.join("\n\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "KIMI_API_KEY not configured. Run the dev server via `yarn start:ai`." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: SplitRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.description?.trim()) {
    return new Response(JSON.stringify({ error: "description is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const currency = "KITE";
  const budget = typeof body.budget === "number" && body.budget > 0 ? body.budget : undefined;

  const upstream = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      stream: true,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt(budget, currency) },
        { role: "user", content: userPrompt(body, currency) },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return new Response(JSON.stringify({ error: `Kimi error ${upstream.status}: ${errText.slice(0, 300)}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      let sseBuffer = ""; // raw SSE text from Kimi
      let jsonlBuffer = ""; // accumulated assistant content, split on \n
      let emitted = 0;

      const emit = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      const handleLine = (line: string) => {
        // Strip leading/trailing whitespace and common code-fence markers Kimi may emit.
        const trimmed = line
          .replace(/^```(?:json|jsonl|ndjson)?\s*/i, "")
          .replace(/\s*```$/, "")
          .trim();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) return;
        // Find the first JSON object on the line (some models add prose prefixes).
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        if (start === -1 || end === -1 || end < start) return;
        const candidate = trimmed.slice(start, end + 1);
        try {
          const parsed = JSON.parse(candidate) as StreamMilestone;
          if (
            typeof parsed?.description === "string" &&
            typeof parsed?.amount === "number" &&
            parsed.amount >= MIN_AMOUNT &&
            emitted < MAX_MILESTONES
          ) {
            emit({
              description: parsed.description,
              acceptance: typeof parsed.acceptance === "string" ? parsed.acceptance : "",
              amount: parsed.amount,
            });
            emitted += 1;
          }
        } catch {
          // ignore non-JSON lines (e.g., stray prose)
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          // Parse SSE events separated by \n\n
          let sep: number;
          while ((sep = sseBuffer.indexOf("\n\n")) !== -1) {
            const rawEvent = sseBuffer.slice(0, sep);
            sseBuffer = sseBuffer.slice(sep + 2);
            for (const evtLine of rawEvent.split("\n")) {
              if (!evtLine.startsWith("data:")) continue;
              const data = evtLine.slice(5).trim();
              if (data === "[DONE]") continue;
              try {
                const payload = JSON.parse(data);
                const delta = payload?.choices?.[0]?.delta?.content;
                if (typeof delta === "string") {
                  jsonlBuffer += delta;
                  let nl: number;
                  while ((nl = jsonlBuffer.indexOf("\n")) !== -1) {
                    const line = jsonlBuffer.slice(0, nl);
                    jsonlBuffer = jsonlBuffer.slice(nl + 1);
                    handleLine(line);
                  }
                }
              } catch {
                // ignore malformed SSE payloads
              }
            }
          }
        }

        // flush any final line without trailing \n
        if (jsonlBuffer.trim()) handleLine(jsonlBuffer);
      } catch (err) {
        emit({ error: err instanceof Error ? err.message : "stream error" });
      } finally {
        if (emitted < MIN_MILESTONES) {
          emit({ error: `AI returned only ${emitted} milestone(s); expected at least ${MIN_MILESTONES}.` });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
