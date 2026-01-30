"use client";

import { useState } from "react";
import { mockSplitMilestones, MilestoneSuggestion } from "~~/utils/mockAI";

interface AIMilestoneSplitterProps {
  onSuggestionsGenerated: (suggestions: MilestoneSuggestion[]) => void;
}

export const AIMilestoneSplitter = ({ onSuggestionsGenerated }: AIMilestoneSplitterProps) => {
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setIsLoading(true);
    try {
      const suggestions = await mockSplitMilestones(description);
      onSuggestionsGenerated(suggestions);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <h3 className="card-title text-lg">AI Milestone Splitter</h3>
        <p className="text-sm opacity-70">
          Describe your project and let AI suggest milestone breakdowns
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

        <div className="card-actions mt-4 justify-end">
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={isLoading || !description.trim()}
          >
            {isLoading ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Generating...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                  />
                </svg>
                Generate Milestones
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
