"use client";

import { useRouter } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import { formatEther } from "viem";
import { useNativeCurrency } from "~~/hooks/useNativeCurrency";
import { ProjectRole, getRoleColor, getRoleLabel } from "~~/hooks/useProjectRole";

interface ProjectCardProps {
  projectId: number;
  client: string;
  pm?: string;
  totalAmount: bigint;
  totalPaid: bigint;
  milestoneCount: number;
  completedMilestones: number;
  assignedMilestones?: number;
  active: boolean;
  role: ProjectRole;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const ProjectCard = ({
  projectId,
  client,
  pm,
  totalAmount,
  totalPaid,
  milestoneCount,
  completedMilestones,
  assignedMilestones = 0,
  active,
  role,
}: ProjectCardProps) => {
  const router = useRouter();
  const { symbol: currencySymbol } = useNativeCurrency();
  const progressPercent = milestoneCount > 0 ? (completedMilestones / milestoneCount) * 100 : 0;
  const remainingAmount = totalAmount - totalPaid;
  const unassignedCount = milestoneCount - assignedMilestones - completedMilestones;

  const handleClick = () => {
    router.push(`/projects/${projectId}`);
  };

  return (
    <div
      onClick={handleClick}
      className="card bg-base-100 shadow-xl transition-all hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
    >
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Project #{projectId}</h2>
          <div className="flex gap-2">
            <span className={`badge ${getRoleColor(role)}`}>{getRoleLabel(role)}</span>
            {!active && <span className="badge badge-error">Inactive</span>}
          </div>
        </div>

        <div className="divider my-2" />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div onClick={e => e.stopPropagation()}>
            <p className="opacity-70">Client</p>
            <Address address={client} />
          </div>
          {pm && pm !== ZERO_ADDRESS && (
            <div onClick={e => e.stopPropagation()}>
              <p className="opacity-70">Project Manager</p>
              <Address address={pm} />
            </div>
          )}
        </div>

        <div className="divider my-2" />

        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>
              {completedMilestones}/{milestoneCount} completed
            </span>
          </div>
          <progress className="progress progress-primary w-full" value={progressPercent} max="100" />
          {unassignedCount > 0 && (
            <p className="text-xs text-info">
              {unassignedCount} milestone{unassignedCount > 1 ? "s" : ""} need assignment
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-base-200 p-3">
            <p className="text-xs opacity-70">Total Value</p>
            <p className="font-bold">
              {formatEther(totalAmount)} {currencySymbol}
            </p>
          </div>
          <div className="rounded-lg bg-base-200 p-3">
            <p className="text-xs opacity-70">Remaining</p>
            <p className="font-bold">
              {formatEther(remainingAmount)} {currencySymbol}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
