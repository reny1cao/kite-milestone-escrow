"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AIMilestoneSplitter } from "./AIMilestoneSplitter";
import { isAddress, parseEther } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useNativeCurrency } from "~~/hooks/useNativeCurrency";
import { MilestoneSuggestion } from "~~/utils/mockAI";
import { notification } from "~~/utils/scaffold-eth";

interface MilestoneInput {
  description: string;
  amount: string;
  assignee: string; // Optional initial assignee
}

export const CreateProjectForm = () => {
  const router = useRouter();
  const { symbol: currencySymbol } = useNativeCurrency();
  const [step, setStep] = useState(1);
  const [milestones, setMilestones] = useState<MilestoneInput[]>([]);
  const [pmAddress, setPmAddress] = useState("");
  const [pmFeeBps, setPmFeeBps] = useState("500"); // 5% default
  const [showAssignees, setShowAssignees] = useState(false);

  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "ProjectEscrow" });

  const handleSuggestionsGenerated = (suggestions: MilestoneSuggestion[]) => {
    setMilestones(suggestions.map(s => ({ ...s, assignee: "" })));
    setStep(2);
  };

  const handleAddMilestone = () => {
    setMilestones([...milestones, { description: "", amount: "0.1", assignee: "" }]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleMilestoneChange = (index: number, field: keyof MilestoneInput, value: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const totalAmount = milestones.reduce((sum, m) => {
    const amount = parseFloat(m.amount) || 0;
    return sum + amount;
  }, 0);

  const pmFeePercent = parseInt(pmFeeBps) / 100;

  const isValidForm = () => {
    if (pmAddress && !isAddress(pmAddress)) return false;
    if (milestones.length === 0) return false;
    if (milestones.some(m => !m.description.trim() || parseFloat(m.amount) <= 0)) return false;
    // Validate assignee addresses if provided
    if (milestones.some(m => m.assignee && !isAddress(m.assignee))) return false;
    return true;
  };

  const handleCreate = async () => {
    if (!isValidForm()) {
      notification.error("Please fill in all required fields correctly");
      return;
    }

    try {
      const descriptions = milestones.map(m => m.description);
      const amounts = milestones.map(m => parseEther(m.amount));
      const pm = pmAddress || "0x0000000000000000000000000000000000000000";
      const fee = pmAddress ? parseInt(pmFeeBps) : 0;
      const totalValue = amounts.reduce((a, b) => a + b, 0n);

      // Build initial assignees array - empty array means no initial assignees
      const hasAnyAssignee = milestones.some(m => m.assignee);
      const initialAssignees = hasAnyAssignee
        ? milestones.map(m => m.assignee || "0x0000000000000000000000000000000000000000")
        : [];

      await writeContractAsync({
        functionName: "createProject",
        args: [pm, BigInt(fee), descriptions, amounts, initialAssignees as `0x${string}`[]],
        value: totalValue,
      });

      notification.success("Project created successfully!");
      router.push("/projects");
    } catch (error) {
      console.error("Error creating project:", error);
      notification.error("Failed to create project");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress Steps */}
      <ul className="steps steps-horizontal w-full mb-8">
        <li className={`step ${step >= 1 ? "step-primary" : ""}`}>Describe Project</li>
        <li className={`step ${step >= 2 ? "step-primary" : ""}`}>Edit Milestones</li>
        <li className={`step ${step >= 3 ? "step-primary" : ""}`}>Configure & Create</li>
      </ul>

      {/* Step 1: AI Splitter */}
      {step === 1 && (
        <div className="space-y-6">
          <AIMilestoneSplitter onSuggestionsGenerated={handleSuggestionsGenerated} />

          <div className="divider">OR</div>

          <div className="text-center">
            <button
              className="btn btn-outline"
              onClick={() => {
                setMilestones([{ description: "", amount: "0.1", assignee: "" }]);
                setStep(2);
              }}
            >
              Create Manually
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Edit Milestones */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex justify-between items-center">
                <h3 className="card-title">Milestones</h3>
                <label className="label cursor-pointer gap-2">
                  <span className="label-text text-sm">Assign workers now</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={showAssignees}
                    onChange={e => setShowAssignees(e.target.checked)}
                  />
                </label>
              </div>

              <div className="space-y-4">
                {milestones.map((milestone, index) => (
                  <div key={index} className="flex gap-4 items-start">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-300 text-sm font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        className="input input-bordered w-full"
                        placeholder="Milestone description"
                        value={milestone.description}
                        onChange={e => handleMilestoneChange(index, "description", e.target.value)}
                      />
                      <div className="flex gap-2">
                        <div className="form-control flex-1">
                          <div className="input-group">
                            <input
                              type="number"
                              step="0.01"
                              min="0.001"
                              className="input input-bordered w-full"
                              placeholder="Amount"
                              value={milestone.amount}
                              onChange={e => handleMilestoneChange(index, "amount", e.target.value)}
                            />
                            <span>{currencySymbol}</span>
                          </div>
                        </div>
                        <button
                          className="btn btn-ghost btn-square text-error"
                          onClick={() => handleRemoveMilestone(index)}
                        >
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
                              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            />
                          </svg>
                        </button>
                      </div>
                      {showAssignees && (
                        <input
                          type="text"
                          className={`input input-bordered input-sm w-full ${
                            milestone.assignee && !isAddress(milestone.assignee) ? "input-error" : ""
                          }`}
                          placeholder="Worker address (optional) 0x..."
                          value={milestone.assignee}
                          onChange={e => handleMilestoneChange(index, "assignee", e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn btn-outline btn-sm mt-4" onClick={handleAddMilestone}>
                + Add Milestone
              </button>

              <div className="divider" />

              <div className="flex justify-between items-center">
                <span className="font-semibold">Total Amount:</span>
                <span className="text-xl font-bold">
                  {totalAmount.toFixed(4)} {currencySymbol}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep(3)}
              disabled={milestones.length === 0 || milestones.some(m => !m.description.trim())}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Configure & Create */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title">Project Configuration</h3>

              <div className="alert alert-info">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="stroke-current shrink-0 w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-sm">Workers can be assigned to each milestone after creation.</p>
                  <p className="text-xs opacity-70">You can assign different workers to different milestones.</p>
                </div>
              </div>

              <div className="divider">Optional: Project Manager</div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">PM Address</span>
                </label>
                <input
                  type="text"
                  className={`input input-bordered ${pmAddress && !isAddress(pmAddress) ? "input-error" : ""}`}
                  placeholder="0x... (leave empty for no PM)"
                  value={pmAddress}
                  onChange={e => setPmAddress(e.target.value)}
                />
                <label className="label">
                  <span className="label-text-alt opacity-70">PM can assign workers and earns commission</span>
                </label>
              </div>

              {pmAddress && isAddress(pmAddress) && (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">PM Fee (%)</span>
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="100"
                    className="range range-primary"
                    value={pmFeeBps}
                    onChange={e => setPmFeeBps(e.target.value)}
                  />
                  <div className="flex justify-between text-xs px-2">
                    <span>1%</span>
                    <span className="font-bold">{pmFeePercent}%</span>
                    <span>20%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title">Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm opacity-70">Milestones</p>
                  <p className="font-bold">{milestones.length}</p>
                </div>
                <div>
                  <p className="text-sm opacity-70">Total Value</p>
                  <p className="font-bold">
                    {totalAmount.toFixed(4)} {currencySymbol}
                  </p>
                </div>
                <div>
                  <p className="text-sm opacity-70">Pre-assigned</p>
                  <p className="font-bold">{milestones.filter(m => m.assignee && isAddress(m.assignee)).length}</p>
                </div>
                {pmAddress && isAddress(pmAddress) && (
                  <>
                    <div>
                      <p className="text-sm opacity-70">PM Fee</p>
                      <p className="font-bold">{pmFeePercent}%</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={!isValidForm() || isMining}>
              {isMining ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Creating...
                </>
              ) : (
                `Create Project (${totalAmount.toFixed(4)} ${currencySymbol})`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
