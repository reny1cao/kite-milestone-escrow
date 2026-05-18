"use client";

import { useRef, useState } from "react";
import { useNativeCurrency } from "~~/hooks/useNativeCurrency";
import { MilestoneSuggestion, streamSplitMilestones } from "~~/utils/mockAI";

interface AIMilestoneSplitterProps {
  onAccept: (suggestions: MilestoneSuggestion[]) => void;
}

type Level = "solo" | "agent" | "team";

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

  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <h3 className="card-title text-lg">AI Milestone Splitter</h3>
        <p className="text-sm opacity-70">
          Describe your project and Kimi will propose a milestone breakdown with acceptance criteria.
        </p>

        <div className="form-control mt-4">
          <label className="label">
            <span className="label-text">Project Description</span>
          </label>
          <textarea
            className="textarea textarea-bordered h-24"
            placeholder="e.g., Build a portfolio website with React and Next.js..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={useBudget}
                onChange={e => setUseBudget(e.target.checked)}
              />
              <span className="label-text">Set total budget</span>
            </label>
            <div className="input-group">
              <input
                type="number"
                step="0.01"
                min="0.001"
                className="input input-bordered input-sm w-full"
                placeholder="Total"
                value={budget}
                disabled={!useBudget}
                onChange={e => setBudget(e.target.value)}
              />
              <span className="text-xs">{currencySymbol}</span>
            </div>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Worker profile</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={level}
              onChange={e => setLevel(e.target.value as Level)}
            >
              <option value="solo">Solo freelancer</option>
              <option value="agent">AI agent</option>
              <option value="team">Small team</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Duration (days, optional)</span>
            </label>
            <input
              type="number"
              min="1"
              className="input input-bordered input-sm"
              placeholder="e.g. 14"
              value={durationDays}
              onChange={e => setDurationDays(e.target.value)}
            />
          </div>
        </div>

        <div className="card-actions mt-4 justify-end">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={isStreaming || !description.trim()}>
            {isStreaming ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Generating...
              </>
            ) : suggestions.length ? (
              "Regenerate"
            ) : (
              "Generate Milestones"
            )}
          </button>
        </div>

        {error && (
          <div className="alert alert-error mt-3 text-sm">
            <span>{error}</span>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <h4 className="font-semibold">Suggestions ({suggestions.length})</h4>
              <span className="text-sm opacity-70">
                Total: {totalSuggested.toFixed(3)} {currencySymbol}
              </span>
            </div>
            <ul className="space-y-2">
              {suggestions.map((m, i) => (
                <li key={i} className="bg-base-100 rounded-md p-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {i + 1}. {m.description}
                    </span>
                    <span className="text-sm whitespace-nowrap">
                      {m.amount} {currencySymbol}
                    </span>
                  </div>
                  {m.acceptance && <div className="text-xs opacity-70 mt-1">Acceptance: {m.acceptance}</div>}
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setSuggestions([])}>
                Clear
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleAccept} disabled={isStreaming}>
                Use these milestones
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
