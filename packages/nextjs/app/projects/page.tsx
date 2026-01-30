"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { ProjectCard } from "~~/components/escrow/ProjectCard";
import { useProjectRole } from "~~/hooks/useProjectRole";

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

type FilterRole = "all" | "client" | "assignee" | "pm";

const ProjectDashboard: NextPage = () => {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<FilterRole>("all");

  const { data: projectCount } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "projectCount",
  });

  const projectIds = useMemo(() => {
    if (!projectCount) return [];
    return Array.from({ length: Number(projectCount) }, (_, i) => i);
  }, [projectCount]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-sm opacity-70 mt-1">
            Manage your escrow projects and milestones
          </p>
        </div>
        <Link href="/projects/create" className="btn btn-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Project
        </Link>
      </div>

      {/* Role Tabs */}
      <div className="tabs tabs-boxed mb-6">
        <button
          className={`tab ${activeTab === "all" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Projects
        </button>
        <button
          className={`tab ${activeTab === "client" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("client")}
        >
          As Client
        </button>
        <button
          className={`tab ${activeTab === "assignee" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("assignee")}
        >
          As Worker
        </button>
        <button
          className={`tab ${activeTab === "pm" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("pm")}
        >
          As PM
        </button>
      </div>

      {!address ? (
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
          <span>Please connect your wallet to view your projects</span>
        </div>
      ) : projectIds.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
          <p className="opacity-70 mb-4">Create your first project to get started</p>
          <Link href="/projects/create" className="btn btn-primary">
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectIds.map(id => (
            <ProjectItem key={id} projectId={id} filterRole={activeTab} />
          ))}
        </div>
      )}
    </div>
  );
};

// Separate component to fetch individual project data
const ProjectItem = ({
  projectId,
  filterRole,
}: {
  projectId: number;
  filterRole: FilterRole;
}) => {
  const { data: projectData, isLoading: isLoadingProject } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "getProject",
    args: [BigInt(projectId)],
  });

  const { data: milestonesData, isLoading: isLoadingMilestones } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "getAllMilestones",
    args: [BigInt(projectId)],
  });

  const { data: projectStats, isLoading: isLoadingStats } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "getProjectStats",
    args: [BigInt(projectId)],
  });

  // ProjectEscrow.getProject returns: (client, pm, pmFeeBps, totalAmount, totalPaid, totalPmFees, active, milestoneCount)
  const project = useMemo(() => {
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

  // getAllMilestones returns: (descriptions, amounts, assignees, statuses, submittedAts, submissionNotes)
  const milestones = useMemo(() => {
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

  // getProjectStats returns: (totalMilestones, completedMilestones, paidMilestones, remainingAmount, assignedMilestones, acceptedMilestones)
  const stats = useMemo(() => {
    if (!projectStats) return undefined;
    if (Array.isArray(projectStats)) {
      return {
        totalMilestones: projectStats[0] as bigint,
        completedMilestones: projectStats[1] as bigint,
        paidMilestones: projectStats[2] as bigint,
        remainingAmount: projectStats[3] as bigint,
        assignedMilestones: projectStats[4] as bigint,
        acceptedMilestones: projectStats[5] as bigint,
      };
    }
    return projectStats as unknown as ProjectStats;
  }, [projectStats]);

  // Check if data is fully loaded and valid
  const isDataValid = project?.client && stats && milestones;

  const role = useProjectRole(
    isDataValid
      ? {
          client: project.client,
          pm: project.pm,
          assignees: milestones.assignees,
        }
      : undefined
  );

  // Show loading skeleton while fetching
  if (isLoadingProject || isLoadingStats || isLoadingMilestones) {
    return (
      <div className="card bg-base-100 shadow-xl animate-pulse">
        <div className="card-body">
          <div className="h-6 bg-base-300 rounded w-1/3 mb-4" />
          <div className="h-4 bg-base-300 rounded w-full mb-2" />
          <div className="h-4 bg-base-300 rounded w-2/3" />
        </div>
      </div>
    );
  }

  // If data not valid, skip
  if (!isDataValid) {
    return null;
  }

  // Filter based on selected tab (skip filter for "all")
  if (filterRole !== "all" && role !== filterRole) {
    return null;
  }

  return (
    <ProjectCard
      projectId={projectId}
      client={project.client}
      pm={project.pm}
      totalAmount={project.totalAmount}
      totalPaid={project.totalPaid}
      milestoneCount={Number(stats.totalMilestones)}
      completedMilestones={Number(stats.completedMilestones)}
      assignedMilestones={Number(stats.assignedMilestones)}
      active={project.active}
      role={role}
    />
  );
};

export default ProjectDashboard;
