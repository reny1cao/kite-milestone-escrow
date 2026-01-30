"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { Address } from "@scaffold-ui/components";
import { hardhat } from "viem/chains";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { StatusBadge, MilestoneStatus } from "~~/components/escrow/StatusBadge";
import { useProjectRole, getRoleLabel, getRoleColor } from "~~/hooks/useProjectRole";

// Dynamic import for heavy component (418 lines) - only loads when needed
const ApprovalActions = dynamic(
  () => import("~~/components/escrow/ApprovalActions").then(mod => ({ default: mod.ApprovalActions })),
  {
    loading: () => <div className="h-10" />,
    ssr: false,
  }
);

interface ProjectData {
  client: string;
  pm: string;
  pmFeeBps: bigint;
  totalAmount: bigint;
  totalPaid: bigint;
  totalPmFees: bigint;
  active: boolean;
  milestoneCount: bigint;
}

interface MilestonesData {
  descriptions: string[];
  amounts: bigint[];
  assignees: string[];
  statuses: number[];
  submittedAts: bigint[];
  submissionNotes: string[];
}

interface ProjectStats {
  totalMilestones: bigint;
  completedMilestones: bigint;
  paidMilestones: bigint;
  remainingAmount: bigint;
  assignedMilestones: bigint;
  acceptedMilestones: bigint;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ProjectDetailPage: NextPage = () => {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.id);
  const { targetNetwork } = useTargetNetwork();

  const {
    data: projectData,
    isLoading: isLoadingProject,
    refetch: refetchProject,
  } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "getProject",
    args: [BigInt(projectId)],
  });

  const {
    data: milestonesData,
    isLoading: isLoadingMilestones,
    refetch: refetchMilestones,
  } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "getAllMilestones",
    args: [BigInt(projectId)],
  });

  const {
    data: statsData,
    isLoading: isLoadingStats,
    refetch: refetchStats,
  } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "getProjectStats",
    args: [BigInt(projectId)],
  });

  // Parse project data - handle array return type
  // ProjectEscrow.getProject returns: (client, pm, pmFeeBps, totalAmount, totalPaid, totalPmFees, active, milestoneCount)
  const project = useMemo((): ProjectData | undefined => {
    if (!projectData) return undefined;
    if (Array.isArray(projectData)) {
      return {
        client: projectData[0] as string,
        pm: projectData[1] as string,
        pmFeeBps: projectData[2] as bigint,
        totalAmount: projectData[3] as bigint,
        totalPaid: projectData[4] as bigint,
        totalPmFees: projectData[5] as bigint,
        active: projectData[6] as boolean,
        milestoneCount: projectData[7] as bigint,
      };
    }
    return projectData as unknown as ProjectData;
  }, [projectData]);

  // Parse milestones data - handle array return type
  // getAllMilestones returns: (descriptions, amounts, assignees, statuses, submittedAts, submissionNotes)
  const milestones = useMemo((): MilestonesData | undefined => {
    if (!milestonesData) return undefined;
    if (Array.isArray(milestonesData)) {
      return {
        descriptions: milestonesData[0] as string[],
        amounts: milestonesData[1] as bigint[],
        assignees: milestonesData[2] as string[],
        statuses: milestonesData[3] as number[],
        submittedAts: milestonesData[4] as bigint[],
        submissionNotes: milestonesData[5] as string[],
      };
    }
    return milestonesData as unknown as MilestonesData;
  }, [milestonesData]);

  // Parse stats data - handle array return type
  // getProjectStats returns: (totalMilestones, completedMilestones, paidMilestones, remainingAmount, assignedMilestones, acceptedMilestones)
  const stats = useMemo((): ProjectStats | undefined => {
    if (!statsData) return undefined;
    if (Array.isArray(statsData)) {
      return {
        totalMilestones: statsData[0] as bigint,
        completedMilestones: statsData[1] as bigint,
        paidMilestones: statsData[2] as bigint,
        remainingAmount: statsData[3] as bigint,
        assignedMilestones: statsData[4] as bigint,
        acceptedMilestones: statsData[5] as bigint,
      };
    }
    return statsData as unknown as ProjectStats;
  }, [statsData]);

  // Check if project data is valid
  const isProjectValid = project?.client;
  const isDataReady = isProjectValid && milestones?.descriptions && stats;

  const role = useProjectRole(
    isProjectValid
      ? {
          client: project.client,
          pm: project.pm,
          assignees: milestones?.assignees,
        }
      : undefined
  );

  // Get unique assignees (workers) from milestones
  const uniqueAssignees = useMemo(() => {
    if (!milestones?.assignees) return [];
    const unique = [...new Set(milestones.assignees)]
      .filter(addr => addr && addr !== ZERO_ADDRESS);
    return unique;
  }, [milestones?.assignees]);

  const handleRefresh = () => {
    refetchProject();
    refetchMilestones();
    refetchStats();
  };

  // Loading state
  if (isLoadingProject || isLoadingMilestones || isLoadingStats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col justify-center items-center min-h-[50vh] gap-4">
          <span className="loading loading-spinner loading-lg" />
          <p className="text-sm opacity-70">Loading project data...</p>
        </div>
      </div>
    );
  }

  // Data not ready
  if (!isDataReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col justify-center items-center min-h-[50vh] gap-4">
          <p className="text-lg">Project not found or data unavailable</p>
          <button className="btn btn-primary" onClick={() => router.push("/projects")}>
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const pmFeePercent = Number(project.pmFeeBps) / 100;
  const progressPercent =
    Number(stats.totalMilestones) > 0
      ? (Number(stats.completedMilestones) / Number(stats.totalMilestones)) * 100
      : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <button className="btn btn-ghost btn-sm mb-2" onClick={() => router.push("/projects")}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Projects
          </button>
          <h1 className="text-3xl font-bold">Project #{projectId}</h1>
        </div>
        <div className="flex gap-2">
          <span className={`badge ${getRoleColor(role)} badge-lg`}>{getRoleLabel(role)}</span>
          {!project.active && <span className="badge badge-error badge-lg">Inactive</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Card */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Progress</h2>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {Number(stats.completedMilestones)}/{Number(stats.totalMilestones)} milestones
                    completed
                  </span>
                  <span>{progressPercent.toFixed(0)}%</span>
                </div>
                <progress className="progress progress-primary w-full h-3" value={progressPercent} max="100" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div className="text-center p-3 bg-base-200 rounded-lg">
                  <p className="text-2xl font-bold">{formatEther(project.totalAmount)}</p>
                  <p className="text-xs opacity-70">Total ETH</p>
                </div>
                <div className="text-center p-3 bg-base-200 rounded-lg">
                  <p className="text-2xl font-bold">{formatEther(project.totalPaid)}</p>
                  <p className="text-xs opacity-70">Paid ETH</p>
                </div>
                <div className="text-center p-3 bg-base-200 rounded-lg">
                  <p className="text-2xl font-bold">{formatEther(stats.remainingAmount)}</p>
                  <p className="text-xs opacity-70">Remaining ETH</p>
                </div>
                {project.pm !== ZERO_ADDRESS && (
                  <div className="text-center p-3 bg-base-200 rounded-lg">
                    <p className="text-2xl font-bold">{formatEther(project.totalPmFees)}</p>
                    <p className="text-xs opacity-70">PM Fees ETH</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Milestones */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Milestones</h2>

              <div className="space-y-4 mt-4">
                {milestones.descriptions.map((description, index) => {
                  const status = Number(milestones.statuses[index]);
                  const amount = milestones.amounts[index];
                  const assignee = milestones.assignees[index];
                  const submissionNote = milestones.submissionNotes[index];
                  const isUnassigned = !assignee || assignee === ZERO_ADDRESS;

                  return (
                    <div
                      key={index}
                      className={`border rounded-lg p-4 ${
                        status === MilestoneStatus.Paid
                          ? "border-success bg-success/5"
                          : status === MilestoneStatus.Submitted
                            ? "border-warning bg-warning/5"
                            : status === MilestoneStatus.Assigned
                              ? "border-info bg-info/5"
                              : "border-base-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              status === MilestoneStatus.Paid ? "bg-success text-success-content" : "bg-base-300"
                            }`}
                          >
                            {status === MilestoneStatus.Paid ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                className="h-4 w-4"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            ) : (
                              index + 1
                            )}
                          </div>
                          <div>
                            <h3 className="font-semibold">{description}</h3>
                            <p className="text-sm opacity-70">{formatEther(amount)} ETH</p>
                            {project.pm !== ZERO_ADDRESS && (
                              <p className="text-xs opacity-50">
                                PM fee: {formatEther((amount * project.pmFeeBps) / 10000n)} ETH ({pmFeePercent}%)
                              </p>
                            )}
                            {/* Assignee info */}
                            {!isUnassigned && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs opacity-50">Assigned to:</span>
                                <Address
                                  address={assignee}
                                  chain={targetNetwork}
                                  size="xs"
                                  blockExplorerAddressLink={
                                    targetNetwork.id === hardhat.id ? `/blockexplorer/address/${assignee}` : undefined
                                  }
                                />
                              </div>
                            )}
                            {isUnassigned && status === MilestoneStatus.Created && (
                              <p className="text-xs text-info mt-1">Unassigned - waiting for worker</p>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      {submissionNote && status >= MilestoneStatus.Submitted && (
                        <div className="mt-4 ml-11 rounded-lg bg-base-200 p-3">
                          <p className="text-xs font-medium opacity-70">Submission Note:</p>
                          <p className="text-sm">{submissionNote}</p>
                        </div>
                      )}

                      <div className="mt-4 ml-11">
                        <ApprovalActions
                          projectId={projectId}
                          milestoneIndex={index}
                          status={status}
                          assignee={assignee}
                          role={role}
                          onSuccess={handleRefresh}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Participants */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Participants</h2>

              <div className="space-y-4 mt-4">
                <div>
                  <p className="text-xs opacity-70 mb-1">Client</p>
                  <Address
                    address={project.client}
                    chain={targetNetwork}
                    blockExplorerAddressLink={
                      targetNetwork.id === hardhat.id ? `/blockexplorer/address/${project.client}` : undefined
                    }
                  />
                </div>

                {project.pm !== ZERO_ADDRESS && (
                  <div>
                    <p className="text-xs opacity-70 mb-1">Project Manager ({pmFeePercent}% fee)</p>
                    <Address
                      address={project.pm}
                      chain={targetNetwork}
                      blockExplorerAddressLink={
                        targetNetwork.id === hardhat.id ? `/blockexplorer/address/${project.pm}` : undefined
                      }
                    />
                  </div>
                )}

                {uniqueAssignees.length > 0 && (
                  <div>
                    <p className="text-xs opacity-70 mb-1">
                      Worker{uniqueAssignees.length > 1 ? "s" : ""} ({uniqueAssignees.length})
                    </p>
                    <div className="space-y-2">
                      {uniqueAssignees.map((assignee, idx) => (
                        <Address
                          key={idx}
                          address={assignee}
                          chain={targetNetwork}
                          blockExplorerAddressLink={
                            targetNetwork.id === hardhat.id ? `/blockexplorer/address/${assignee}` : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {uniqueAssignees.length === 0 && (
                  <div>
                    <p className="text-xs opacity-70 mb-1">Workers</p>
                    <p className="text-sm text-info">No workers assigned yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Quick Stats</h2>

              <div className="stats stats-vertical shadow">
                <div className="stat">
                  <div className="stat-title">Status</div>
                  <div className="stat-value text-lg">{project.active ? "Active" : "Inactive"}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Milestones</div>
                  <div className="stat-value text-lg">{Number(stats.totalMilestones)}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Assigned</div>
                  <div className="stat-value text-lg">{Number(stats.assignedMilestones)}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Accepted</div>
                  <div className="stat-value text-lg">{Number(stats.acceptedMilestones)}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Paid Out</div>
                  <div className="stat-value text-lg">{formatEther(project.totalPaid)} ETH</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailPage;
