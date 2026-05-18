"use client";

import { useRef, useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { useNativeCurrency } from "~~/hooks/useNativeCurrency";
import { MilestoneSuggestion, streamSplitMilestones } from "~~/utils/mockAI";

interface AIMilestoneSplitterProps {
  onAccept: (suggestions: MilestoneSuggestion[]) => void;
}

type Level = "solo" | "agent" | "team";

const fieldLabel = "text-xs font-medium uppercase tracking-wide opacity-60";

export const AIMilestoneSplitter = ({ onAccept }: AIMilestoneSplitterProps) => {
  const { symbol: currencySymbol } = useNativeCurrency();

  const [description, setDescription] = useState("");
  const [useBudget, setUseBudget] = useState(false);
  const [budget, setBudget] = useState("1.0");
  const [level, setLevel] = useState<Level>("solo");
  const [durationDays, setDurationDays] = useState("");

  const [suggestions, setSuggestions] = useState<MilestoneSuggestion[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setSuggestions([]);
    setError(null);
    setIsStreaming(true);

    try {
      const parsedBudget = useBudget ? parseFloat(budget) : undefined;
      const parsedDuration = durationDays ? parseInt(durationDays, 10) : undefined;
      for await (const evt of streamSplitMilestones(
        {
          description,
          budget: parsedBudget && parsedBudget > 0 ? parsedBudget : undefined,
          level,
          durationDays: parsedDuration && parsedDuration > 0 ? parsedDuration : undefined,
        },
        ctrl.signal,
      )) {
        if (evt.type === "error") {
          setError(evt.message);
        } else {
          setSuggestions(prev => [...prev, evt.milestone]);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleAccept = () => {
    if (!suggestions.length) return;
    onAccept(suggestions);
  };

  const totalSuggested = suggestions.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
  const canGenerate = description.trim().length > 0 && !isStreaming;

  return (
    <div className="rounded-2xl border border-base-300 bg-base-100 shadow-sm">
      <div className="flex items-center gap-3 border-b border-base-300 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20">
          <SparklesIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold leading-tight">AI Milestone Splitter</h3>
          <p className="text-xs opacity-60">
            Describe the work and we&apos;ll propose a milestone breakdown with acceptance criteria, streamed live.
          </p>
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="space-y-2">
          <label htmlFor="ai-description" className={fieldLabel}>
            Project description
          </label>
          <textarea
            id="ai-description"
            className="textarea textarea-bordered w-full min-h-[6rem] resize-y leading-relaxed"
            placeholder="e.g., Build a portfolio website in Next.js with a hero, projects grid, and a contact form"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="ai-budget" className={fieldLabel}>
                Total budget
              </label>
              <input
                type="checkbox"
                aria-label="Toggle budget"
                className="toggle toggle-xs toggle-primary"
                checked={useBudget}
                onChange={e => setUseBudget(e.target.checked)}
              />
            </div>
            <div className="join w-full">
              <input
                id="ai-budget"
                type="number"
                step="0.01"
                min="0.001"
                className="input input-sm input-bordered join-item w-full"
                placeholder="Optional"
                value={budget}
                disabled={!useBudget}
                onChange={e => setBudget(e.target.value)}
              />
              <span className="join-item flex items-center bg-base-200 px-3 text-xs opacity-70">{currencySymbol}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-level" className={fieldLabel}>
              Worker profile
            </label>
            <select
              id="ai-level"
              className="select select-sm select-bordered w-full"
              value={level}
              onChange={e => setLevel(e.target.value as Level)}
            >
              <option value="solo">Solo freelancer</option>
              <option value="agent">AI agent</option>
              <option value="team">Small team</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-duration" className={fieldLabel}>
              Duration (days)
            </label>
            <input
              id="ai-duration"
              type="number"
              min="1"
              className="input input-sm input-bordered w-full"
              placeholder="Optional"
              value={durationDays}
              onChange={e => setDurationDays(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={!canGenerate}>
            {isStreaming ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Generating…
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                {suggestions.length ? "Regenerate" : "Generate milestones"}
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="alert alert-error text-sm">
            <span>{error}</span>
          </div>
        )}

        {(suggestions.length > 0 || isStreaming) && (
          <div className="space-y-3 rounded-xl bg-base-200/60 p-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-semibold">
                {isStreaming ? "Streaming suggestions…" : `Suggestions (${suggestions.length})`}
              </h4>
              {suggestions.length > 0 && (
                <span className="text-xs opacity-70">
                  Total: {totalSuggested.toFixed(3)} {currencySymbol}
                </span>
              )}
            </div>

            <ol className="space-y-2">
              {suggestions.map((m, i) => (
                <li key={i} className="rounded-lg border border-base-300 bg-base-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="font-medium">{m.description}</span>
                    </div>
                    <span className="whitespace-nowrap text-sm tabular-nums">
                      {m.amount} <span className="opacity-60">{currencySymbol}</span>
                    </span>
                  </div>
                  {m.acceptance && (
                    <div className="mt-2 ml-7 text-xs opacity-70">
                      <span className="font-medium opacity-100">Acceptance:</span> {m.acceptance}
                    </div>
                  )}
                </li>
              ))}
              {isStreaming && (
                <li className="flex items-center gap-2 rounded-lg border border-dashed border-base-300 p-3 text-sm opacity-60">
                  <span className="loading loading-dots loading-sm" />
                  thinking…
                </li>
              )}
            </ol>

            {suggestions.length > 0 && !isStreaming && (
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn btn-ghost btn-sm" onClick={() => setSuggestions([])}>
                  Clear
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleAccept}>
                  Use these milestones
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
