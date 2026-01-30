"use client";

import { useAccount } from "wagmi";

export type ProjectRole = "client" | "pm" | "assignee" | "none";

interface ProjectData {
  client: string;
  pm: string;
  assignees?: string[]; // Array of milestone assignees
}

/**
 * Determine user's role in a project
 * Note: With the new contract, a user can be an assignee for specific milestones
 */
export const useProjectRole = (project: ProjectData | undefined): ProjectRole => {
  const { address } = useAccount();

  if (!project || !address) {
    return "none";
  }

  if (!project.client) {
    return "none";
  }

  const lowerAddress = address.toLowerCase();

  if (project.client.toLowerCase() === lowerAddress) {
    return "client";
  }

  if (project.pm && project.pm !== "0x0000000000000000000000000000000000000000" && project.pm.toLowerCase() === lowerAddress) {
    return "pm";
  }

  // Check if user is assignee for any milestone
  if (project.assignees) {
    const isAssignee = project.assignees.some(
      assignee => assignee && assignee !== "0x0000000000000000000000000000000000000000" && assignee.toLowerCase() === lowerAddress
    );
    if (isAssignee) {
      return "assignee";
    }
  }

  return "none";
};

/**
 * Check if user is assignee for a specific milestone
 */
export const useIsMilestoneAssignee = (assignee: string | undefined): boolean => {
  const { address } = useAccount();

  if (!assignee || !address) {
    return false;
  }

  if (assignee === "0x0000000000000000000000000000000000000000") {
    return false;
  }

  return assignee.toLowerCase() === address.toLowerCase();
};

export const getRoleLabel = (role: ProjectRole): string => {
  switch (role) {
    case "client":
      return "Client";
    case "pm":
      return "Project Manager";
    case "assignee":
      return "Worker";
    default:
      return "Viewer";
  }
};

export const getRoleColor = (role: ProjectRole): string => {
  switch (role) {
    case "client":
      return "badge-primary";
    case "pm":
      return "badge-accent";
    case "assignee":
      return "badge-secondary";
    default:
      return "badge-ghost";
  }
};
