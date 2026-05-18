export interface MilestoneSuggestion {
  description: string;
  amount: string;
  acceptance?: string;
}

export type SplitOptions = {
  description: string;
  budget?: number;
  level?: "solo" | "agent" | "team";
  durationDays?: number;
};

export type StreamEvent = { type: "milestone"; milestone: MilestoneSuggestion } | { type: "error"; message: string };

/**
 * Streams milestone suggestions from the AI splitter route.
 * Yields one event per parsed NDJSON line.
 */
export async function* streamSplitMilestones(opts: SplitOptions, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const res = await fetch("/api/ai/split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });

  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch {
      // ignore
    }
    yield { type: "error", message: msg };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed?.error) {
          yield { type: "error", message: String(parsed.error) };
          continue;
        }
        if (typeof parsed?.description === "string" && typeof parsed?.amount === "number") {
          yield {
            type: "milestone",
            milestone: {
              description: parsed.description,
              amount: String(parsed.amount),
              acceptance: typeof parsed.acceptance === "string" ? parsed.acceptance : undefined,
            },
          };
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}
