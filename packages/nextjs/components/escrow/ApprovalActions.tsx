"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { MilestoneStatus } from "./StatusBadge";
import type { ProjectRole } from "~~/hooks/useProjectRole";

interface ApprovalActionsProps {
  projectId: number;
  milestoneIndex: number;
  status: MilestoneStatus | number;
  assignee: string;
  role: ProjectRole;
  onSuccess?: () => void;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const ApprovalActions = ({
  projectId,
  milestoneIndex,
  status,
  assignee,
  role,
  onSuccess,
}: ApprovalActionsProps) => {
  const { address } = useAccount();
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [submissionNote, setSubmissionNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [assigneeAddress, setAssigneeAddress] = useState("");

  const { writeContractAsync, isMining } = useScaffoldWriteContract({
    contractName: "ProjectEscrow",
  });

  const statusNum = Number(status);
  const isAssignee = address && assignee && assignee !== ZERO_ADDRESS && assignee.toLowerCase() === address.toLowerCase();
  const isUnassigned = !assignee || assignee === ZERO_ADDRESS;
  const canAssign = (role === "client" || role === "pm") && statusNum === MilestoneStatus.Created && isUnassigned;
  const canUnassign = (role === "client" || role === "pm") && statusNum === MilestoneStatus.Assigned;
  const canAccept = isAssignee && statusNum === MilestoneStatus.Assigned;
  const canDecline = isAssignee && statusNum === MilestoneStatus.Assigned;
  const canStart = isAssignee && statusNum === MilestoneStatus.Accepted;
  const canSubmit = isAssignee && (statusNum === MilestoneStatus.Accepted || statusNum === MilestoneStatus.InProgress);
  const canApprove = role === "client" && statusNum === MilestoneStatus.Submitted;
  const canReject = role === "client" && statusNum === MilestoneStatus.Submitted;

  const handleAssign = async () => {
    if (!assigneeAddress.trim()) {
      notification.error("Please enter an address");
      return;
    }

    try {
      await writeContractAsync({
        functionName: "assignMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex), assigneeAddress as `0x${string}`],
      });
      notification.success("Worker assigned!");
      setIsAssignModalOpen(false);
      setAssigneeAddress("");
      onSuccess?.();
    } catch (error) {
      console.error("Error assigning milestone:", error);
      notification.error("Failed to assign milestone");
    }
  };

  const handleUnassign = async () => {
    try {
      await writeContractAsync({
        functionName: "unassignMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex)],
      });
      notification.success("Assignment removed");
      onSuccess?.();
    } catch (error) {
      console.error("Error unassigning milestone:", error);
      notification.error("Failed to unassign milestone");
    }
  };

  const handleAccept = async () => {
    try {
      await writeContractAsync({
        functionName: "acceptMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex)],
      });
      notification.success("Assignment accepted!");
      onSuccess?.();
    } catch (error) {
      console.error("Error accepting milestone:", error);
      notification.error("Failed to accept milestone");
    }
  };

  const handleDecline = async () => {
    try {
      await writeContractAsync({
        functionName: "declineMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex), declineReason || "Not available"],
      });
      notification.success("Assignment declined");
      setIsDeclineModalOpen(false);
      setDeclineReason("");
      onSuccess?.();
    } catch (error) {
      console.error("Error declining milestone:", error);
      notification.error("Failed to decline milestone");
    }
  };

  const handleStart = async () => {
    try {
      await writeContractAsync({
        functionName: "startMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex)],
      });
      notification.success("Milestone started!");
      onSuccess?.();
    } catch (error) {
      console.error("Error starting milestone:", error);
      notification.error("Failed to start milestone");
    }
  };

  const handleSubmit = async () => {
    if (!submissionNote.trim()) {
      notification.error("Please add a submission note");
      return;
    }

    try {
      await writeContractAsync({
        functionName: "submitMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex), submissionNote],
      });
      notification.success("Milestone submitted for review!");
      setIsSubmitModalOpen(false);
      setSubmissionNote("");
      onSuccess?.();
    } catch (error) {
      console.error("Error submitting milestone:", error);
      notification.error("Failed to submit milestone");
    }
  };

  const handleApprove = async () => {
    try {
      await writeContractAsync({
        functionName: "approveMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex)],
      });
      notification.success("Milestone approved and payment sent!");
      onSuccess?.();
    } catch (error) {
      console.error("Error approving milestone:", error);
      notification.error("Failed to approve milestone");
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      notification.error("Please provide a reason for rejection");
      return;
    }

    try {
      await writeContractAsync({
        functionName: "rejectMilestone",
        args: [BigInt(projectId), BigInt(milestoneIndex), rejectReason],
      });
      notification.success("Milestone rejected");
      setIsRejectModalOpen(false);
      setRejectReason("");
      onSuccess?.();
    } catch (error) {
      console.error("Error rejecting milestone:", error);
      notification.error("Failed to reject milestone");
    }
  };

  const hasAnyAction = canAssign || canUnassign || canAccept || canDecline || canStart || canSubmit || canApprove || canReject;

  if (!hasAnyAction) {
    return null;
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {/* Assignment actions */}
        {canAssign && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setIsAssignModalOpen(true)}
            disabled={isMining}
          >
            Assign Worker
          </button>
        )}

        {canUnassign && (
          <button
            className="btn btn-outline btn-sm btn-warning"
            onClick={handleUnassign}
            disabled={isMining}
          >
            {isMining ? <span className="loading loading-spinner loading-xs" /> : "Unassign"}
          </button>
        )}

        {/* Acceptance actions */}
        {canAccept && (
          <button
            className="btn btn-success btn-sm"
            onClick={handleAccept}
            disabled={isMining}
          >
            {isMining ? <span className="loading loading-spinner loading-xs" /> : "Accept"}
          </button>
        )}

        {canDecline && (
          <button
            className="btn btn-outline btn-error btn-sm"
            onClick={() => setIsDeclineModalOpen(true)}
            disabled={isMining}
          >
            Decline
          </button>
        )}

        {/* Work actions */}
        {canStart && (
          <button
            className="btn btn-outline btn-sm"
            onClick={handleStart}
            disabled={isMining}
          >
            {isMining ? <span className="loading loading-spinner loading-xs" /> : "Start Work"}
          </button>
        )}

        {canSubmit && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setIsSubmitModalOpen(true)}
            disabled={isMining}
          >
            Submit Deliverable
          </button>
        )}

        {/* Approval actions */}
        {canReject && (
          <button
            className="btn btn-outline btn-error btn-sm"
            onClick={() => setIsRejectModalOpen(true)}
            disabled={isMining}
          >
            Reject
          </button>
        )}

        {canApprove && (
          <button
            className="btn btn-success btn-sm"
            onClick={handleApprove}
            disabled={isMining}
          >
            {isMining ? <span className="loading loading-spinner loading-xs" /> : "Approve & Pay"}
          </button>
        )}
      </div>

      {/* Assign Modal */}
      <dialog className={`modal ${isAssignModalOpen ? "modal-open" : ""}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">Assign Worker</h3>
          <p className="py-4 text-sm opacity-70">
            Enter the wallet address of the worker to assign to this milestone.
          </p>
          <div className="form-control">
            <input
              type="text"
              className="input input-bordered"
              placeholder="0x..."
              value={assigneeAddress}
              onChange={e => setAssigneeAddress(e.target.value)}
            />
          </div>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAssign}
              disabled={isMining || !assigneeAddress.trim()}
            >
              {isMining ? <span className="loading loading-spinner loading-xs" /> : "Assign"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setIsAssignModalOpen(false)}>close</button>
        </form>
      </dialog>

      {/* Decline Modal */}
      <dialog className={`modal ${isDeclineModalOpen ? "modal-open" : ""}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">Decline Assignment</h3>
          <p className="py-4 text-sm opacity-70">
            Optionally provide a reason for declining this assignment.
          </p>
          <div className="form-control">
            <textarea
              className="textarea textarea-bordered h-24"
              placeholder="Reason (optional)..."
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
          </div>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => setIsDeclineModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-error"
              onClick={handleDecline}
              disabled={isMining}
            >
              {isMining ? <span className="loading loading-spinner loading-xs" /> : "Decline"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setIsDeclineModalOpen(false)}>close</button>
        </form>
      </dialog>

      {/* Submit Modal */}
      <dialog className={`modal ${isSubmitModalOpen ? "modal-open" : ""}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">Submit Milestone</h3>
          <p className="py-4 text-sm opacity-70">
            Describe your deliverables and any relevant details for the client to review.
          </p>
          <div className="form-control">
            <textarea
              className="textarea textarea-bordered h-32"
              placeholder="Describe what you've completed..."
              value={submissionNote}
              onChange={e => setSubmissionNote(e.target.value)}
            />
          </div>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => setIsSubmitModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isMining || !submissionNote.trim()}
            >
              {isMining ? <span className="loading loading-spinner loading-xs" /> : "Submit"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setIsSubmitModalOpen(false)}>close</button>
        </form>
      </dialog>

      {/* Reject Modal */}
      <dialog className={`modal ${isRejectModalOpen ? "modal-open" : ""}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">Reject Submission</h3>
          <p className="py-4 text-sm opacity-70">
            Provide feedback to help the worker improve their submission.
          </p>
          <div className="form-control">
            <textarea
              className="textarea textarea-bordered h-32"
              placeholder="Explain what needs to be improved..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-error"
              onClick={handleReject}
              disabled={isMining || !rejectReason.trim()}
            >
              {isMining ? <span className="loading loading-spinner loading-xs" /> : "Reject"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setIsRejectModalOpen(false)}>close</button>
        </form>
      </dialog>
    </>
  );
};
