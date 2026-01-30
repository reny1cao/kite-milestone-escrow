"use client";

// Milestone status enum values (matching ProjectEscrow contract)
export enum MilestoneStatus {
  Created = 0,
  Assigned = 1,
  Accepted = 2,
  InProgress = 3,
  Submitted = 4,
  Approved = 5,
  Paid = 6,
}

interface StatusBadgeProps {
  status: MilestoneStatus | number;
  size?: "sm" | "md" | "lg";
}

const statusConfig: Record<MilestoneStatus, { label: string; className: string }> = {
  [MilestoneStatus.Created]: {
    label: "Open",
    className: "badge-ghost",
  },
  [MilestoneStatus.Assigned]: {
    label: "Assigned",
    className: "badge-info badge-outline",
  },
  [MilestoneStatus.Accepted]: {
    label: "Accepted",
    className: "badge-info",
  },
  [MilestoneStatus.InProgress]: {
    label: "In Progress",
    className: "badge-warning",
  },
  [MilestoneStatus.Submitted]: {
    label: "Submitted",
    className: "badge-accent",
  },
  [MilestoneStatus.Approved]: {
    label: "Approved",
    className: "badge-success badge-outline",
  },
  [MilestoneStatus.Paid]: {
    label: "Paid",
    className: "badge-success",
  },
};

export const StatusBadge = ({ status, size = "md" }: StatusBadgeProps) => {
  const config = statusConfig[status as MilestoneStatus] || statusConfig[MilestoneStatus.Created];

  const sizeClass = {
    sm: "badge-sm",
    md: "",
    lg: "badge-lg",
  }[size];

  return <span className={`badge ${config.className} ${sizeClass}`}>{config.label}</span>;
};

export const getStatusLabel = (status: MilestoneStatus | number): string => {
  return statusConfig[status as MilestoneStatus]?.label || "Unknown";
};
