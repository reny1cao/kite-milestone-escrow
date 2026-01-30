"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import {
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  const { data: projectCount } = useScaffoldReadContract({
    contractName: "ProjectEscrow",
    functionName: "projectCount",
  });

  return (
    <>
      <div className="flex flex-col grow">
        {/* Hero Section */}
        <div className="hero min-h-[60vh] bg-gradient-to-br from-primary/10 via-base-100 to-secondary/10">
          <div className="hero-content text-center">
            <div className="max-w-2xl">
              <h1 className="text-5xl font-bold">
                Agent PM Escrow
              </h1>
              <p className="py-6 text-lg opacity-80">
                Secure milestone-based payments for freelance projects.
                Create projects, set milestones, and release payments only when work is completed.
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Link href="/projects/create" className="btn btn-primary btn-lg">
                  Create Project
                </Link>
                <Link href="/projects" className="btn btn-outline btn-lg">
                  View Projects
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="bg-base-200 py-12">
          <div className="container mx-auto px-4">
            <div className="stats stats-vertical lg:stats-horizontal shadow w-full">
              <div className="stat">
                <div className="stat-figure text-primary">
                  <ClipboardDocumentListIcon className="h-8 w-8" />
                </div>
                <div className="stat-title">Total Projects</div>
                <div className="stat-value text-primary">{projectCount?.toString() || "0"}</div>
                <div className="stat-desc">On the platform</div>
              </div>

              <div className="stat">
                <div className="stat-figure text-secondary">
                  <ShieldCheckIcon className="h-8 w-8" />
                </div>
                <div className="stat-title">Smart Contract</div>
                <div className="stat-value text-secondary">Secured</div>
                <div className="stat-desc">Reentrancy protected</div>
              </div>

              <div className="stat">
                <div className="stat-figure text-accent">
                  <CurrencyDollarIcon className="h-8 w-8" />
                </div>
                <div className="stat-title">PM Fee Cap</div>
                <div className="stat-value text-accent">20%</div>
                <div className="stat-desc">Maximum commission</div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="container mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
                <h3 className="card-title">Create Project</h3>
                <p className="opacity-70">
                  Define milestones with AI assistance or manually. Set freelancer and optional PM with fee percentage.
                </p>
              </div>
            </div>

            <div className="card bg-base-100 shadow-xl">
              <div className="card-body items-center text-center">
                <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-secondary">2</span>
                </div>
                <h3 className="card-title">Work & Submit</h3>
                <p className="opacity-70">
                  Freelancer works on milestones and submits deliverables with notes for client review.
                </p>
              </div>
            </div>

            <div className="card bg-base-100 shadow-xl">
              <div className="card-body items-center text-center">
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-accent">3</span>
                </div>
                <h3 className="card-title">Approve & Pay</h3>
                <p className="opacity-70">
                  Client approves work and payment is automatically released to freelancer (and PM if assigned).
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Roles Section */}
        <div className="bg-base-200 py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Three Roles</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="badge badge-primary mb-2">Client</div>
                  <h3 className="card-title">Project Owner</h3>
                  <ul className="list-disc list-inside space-y-2 text-sm opacity-70">
                    <li>Create projects and fund milestones</li>
                    <li>Review and approve deliverables</li>
                    <li>Reject with feedback for revisions</li>
                    <li>Cancel projects if needed</li>
                  </ul>
                </div>
              </div>

              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="badge badge-secondary mb-2">Freelancer</div>
                  <h3 className="card-title">Worker</h3>
                  <ul className="list-disc list-inside space-y-2 text-sm opacity-70">
                    <li>Start working on milestones</li>
                    <li>Submit completed work with notes</li>
                    <li>Receive payment on approval</li>
                    <li>Auto-release after 14 days</li>
                  </ul>
                </div>
              </div>

              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="badge badge-accent mb-2">Project Manager</div>
                  <h3 className="card-title">Optional Facilitator</h3>
                  <ul className="list-disc list-inside space-y-2 text-sm opacity-70">
                    <li>Earn commission (up to 20%)</li>
                    <li>Fee deducted from freelancer payment</li>
                    <li>Automatic payout on approval</li>
                    <li>Track earnings across projects</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-16">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="opacity-70 mb-8 max-w-md mx-auto">
              {connectedAddress
                ? "Create your first project or browse existing ones."
                : "Connect your wallet to start creating projects."}
            </p>
            {connectedAddress ? (
              <Link href="/projects/create" className="btn btn-primary btn-lg">
                Create Your First Project
              </Link>
            ) : (
              <p className="text-sm opacity-50">Connect wallet above to continue</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
