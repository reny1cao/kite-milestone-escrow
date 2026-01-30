"use client";

import { formatEther } from "viem";
import { StatusBadge, MilestoneStatus } from "./StatusBadge";

interface MilestoneCardProps {
  index: number;
  description: string;
  amount: bigint;
  status: MilestoneStatus | number;
  submissionNote?: string;
  role: "client" | "freelancer" | "pm" | "none";
  onStart?: () => void;
  onSubmit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isLoading?: boolean;
}

export const MilestoneCard = ({
  index,
  description,
  amount,
  status,
  submissionNote,
  role,
  onStart,
  onSubmit,
  onApprove,
  onReject,
  isLoading = false,
}: MilestoneCardProps) => {
  const statusNum = Number(status);

  const canStart = role === "freelancer" && statusNum === MilestoneStatus.Created;
  const canSubmit = role === "freelancer" && (statusNum === MilestoneStatus.Created || statusNum === MilestoneStatus.InProgress);
  const canApprove = role === "client" && statusNum === MilestoneStatus.Submitted;
  const canReject = role === "client" && statusNum === MilestoneStatus.Submitted;

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-base-300 text-sm font-bold">
              {index + 1}
            </div>
            <div>
              <h3 className="font-semibold">{description}</h3>
              <p className="text-sm opacity-70">{formatEther(amount)} ETH</p>
            </div>
          </div>
          <StatusBadge status={statusNum} />
        </div>

        {submissionNote && statusNum >= MilestoneStatus.Submitted && (
          <div className="mt-4 rounded-lg bg-base-200 p-3">
            <p className="text-xs font-medium opacity-70">Submission Note:</p>
            <p className="text-sm">{submissionNote}</p>
          </div>
        )}

        {(canStart || canSubmit || canApprove || canReject) && (
          <div className="card-actions mt-4 justify-end">
            {canStart && (
              <button
                className="btn btn-outline btn-sm"
                onClick={onStart}
                disabled={isLoading}
              >
                {isLoading ? <span className="loading loading-spinner loading-xs" /> : "Start Work"}
              </button>
            )}
            {canSubmit && (
              <button
                className="btn btn-primary btn-sm"
                onClick={onSubmit}
                disabled={isLoading}
              >
                {isLoading ? <span className="loading loading-spinner loading-xs" /> : "Submit"}
              </button>
            )}
            {canReject && (
              <button
                className="btn btn-outline btn-error btn-sm"
                onClick={onReject}
                disabled={isLoading}
              >
                {isLoading ? <span className="loading loading-spinner loading-xs" /> : "Reject"}
              </button>
            )}
            {canApprove && (
              <button
                className="btn btn-success btn-sm"
                onClick={onApprove}
                disabled={isLoading}
              >
                {isLoading ? <span className="loading loading-spinner loading-xs" /> : "Approve & Pay"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
