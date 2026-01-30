import { expect } from "chai";
import { ethers } from "hardhat";
import { MilestoneEscrow } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("MilestoneEscrow", function () {
  let escrow: MilestoneEscrow;
  let client: HardhatEthersSigner;
  let freelancer: HardhatEthersSigner;
  let pm: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const TIMEOUT_PERIOD = 14 * 24 * 60 * 60; // 14 days in seconds
  const MIN_AMOUNT = ethers.parseEther("0.001");
  const ZERO_ADDRESS = ethers.ZeroAddress;

  // Status enum values
  const Status = {
    Created: 0,
    InProgress: 1,
    Submitted: 2,
    Approved: 3,
    Paid: 4,
  };

  beforeEach(async () => {
    [client, freelancer, pm, other] = await ethers.getSigners();
    const escrowFactory = await ethers.getContractFactory("MilestoneEscrow");
    escrow = (await escrowFactory.deploy()) as MilestoneEscrow;
    await escrow.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should initialize with correct constants", async function () {
      expect(await escrow.TIMEOUT_PERIOD()).to.equal(TIMEOUT_PERIOD);
      expect(await escrow.projectCount()).to.equal(0);
      expect(await escrow.MAX_PM_FEE_BPS()).to.equal(2000);
      expect(await escrow.BPS_DENOMINATOR()).to.equal(10000);
    });
  });

  describe("Project Creation", function () {
    it("Should create a project without PM", async function () {
      const descriptions = ["Design", "Development", "Testing"];
      const amounts = [
        ethers.parseEther("1"),
        ethers.parseEther("2"),
        ethers.parseEther("1"),
      ];
      const totalAmount = ethers.parseEther("4");

      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          ZERO_ADDRESS,
          0,
          descriptions,
          amounts,
          { value: totalAmount }
        )
      )
        .to.emit(escrow, "ProjectCreated")
        .withArgs(0, client.address, freelancer.address, ZERO_ADDRESS, 0, totalAmount, 3);

      const project = await escrow.getProject(0);
      expect(project.client).to.equal(client.address);
      expect(project.freelancer).to.equal(freelancer.address);
      expect(project.pm).to.equal(ZERO_ADDRESS);
      expect(project.pmFeeBps).to.equal(0);
      expect(project.totalAmount).to.equal(totalAmount);
      expect(project.active).to.be.true;
      expect(project.milestoneCount).to.equal(3);
    });

    it("Should create a project with PM and fee", async function () {
      const descriptions = ["Design", "Development"];
      const amounts = [ethers.parseEther("1"), ethers.parseEther("1")];
      const totalAmount = ethers.parseEther("2");
      const pmFeeBps = 500; // 5%

      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          pm.address,
          pmFeeBps,
          descriptions,
          amounts,
          { value: totalAmount }
        )
      )
        .to.emit(escrow, "ProjectCreated")
        .withArgs(0, client.address, freelancer.address, pm.address, pmFeeBps, totalAmount, 2);

      const project = await escrow.getProject(0);
      expect(project.pm).to.equal(pm.address);
      expect(project.pmFeeBps).to.equal(pmFeeBps);
    });

    it("Should reject if freelancer is zero address", async function () {
      await expect(
        escrow.connect(client).createProject(
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          0,
          ["Test"],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("Invalid freelancer address");
    });

    it("Should reject if client equals freelancer", async function () {
      await expect(
        escrow.connect(client).createProject(
          client.address,
          ZERO_ADDRESS,
          0,
          ["Test"],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("Client cannot be freelancer");
    });

    it("Should reject if client is PM", async function () {
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          client.address,
          500,
          ["Test"],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("Client cannot be PM");
    });

    it("Should reject if freelancer is PM", async function () {
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          freelancer.address,
          500,
          ["Test"],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("Freelancer cannot be PM");
    });

    it("Should reject if PM fee set without PM address", async function () {
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          ZERO_ADDRESS,
          500,
          ["Test"],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("Cannot set fee without PM");
    });

    it("Should reject if PM fee exceeds maximum", async function () {
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          pm.address,
          2500, // 25% > 20%
          ["Test"],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("PM fee too high");
    });

    it("Should reject if arrays have different lengths", async function () {
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          ZERO_ADDRESS,
          0,
          ["Design", "Development"],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should reject if amount is below minimum", async function () {
      const tooSmall = ethers.parseEther("0.0001");
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          ZERO_ADDRESS,
          0,
          ["Test"],
          [tooSmall],
          { value: tooSmall }
        )
      ).to.be.revertedWith("Amount too small");
    });

    it("Should reject if description is empty", async function () {
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          ZERO_ADDRESS,
          0,
          [""],
          [MIN_AMOUNT],
          { value: MIN_AMOUNT }
        )
      ).to.be.revertedWith("Description required");
    });

    it("Should reject if incorrect payment amount", async function () {
      const amount = ethers.parseEther("1");
      await expect(
        escrow.connect(client).createProject(
          freelancer.address,
          ZERO_ADDRESS,
          0,
          ["Test"],
          [amount],
          { value: ethers.parseEther("0.5") }
        )
      ).to.be.revertedWith("Incorrect payment amount");
    });
  });

  describe("State Machine - Start Milestone", function () {
    let projectId: number;

    beforeEach(async () => {
      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design", "Development"],
        [ethers.parseEther("1"), ethers.parseEther("2")],
        { value: ethers.parseEther("3") }
      );
      await tx.wait();
      projectId = 0;
    });

    it("Should allow freelancer to start milestone", async function () {
      await expect(escrow.connect(freelancer).startMilestone(projectId, 0))
        .to.emit(escrow, "MilestoneStarted")
        .withArgs(projectId, 0);

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.InProgress);
    });

    it("Should reject if not called by freelancer", async function () {
      await expect(
        escrow.connect(client).startMilestone(projectId, 0)
      ).to.be.revertedWith("Only freelancer");
    });

    it("Should reject if milestone not in Created status", async function () {
      await escrow.connect(freelancer).startMilestone(projectId, 0);
      await expect(
        escrow.connect(freelancer).startMilestone(projectId, 0)
      ).to.be.revertedWith("Milestone not in Created status");
    });
  });

  describe("State Machine - Submit Milestone", function () {
    let projectId: number;

    beforeEach(async () => {
      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [ethers.parseEther("1")],
        { value: ethers.parseEther("1") }
      );
      await tx.wait();
      projectId = 0;
    });

    it("Should allow freelancer to submit from InProgress", async function () {
      await escrow.connect(freelancer).startMilestone(projectId, 0);

      await expect(escrow.connect(freelancer).submitMilestone(projectId, 0, "Deliverables ready"))
        .to.emit(escrow, "MilestoneSubmitted")
        .withArgs(projectId, 0, "Deliverables ready");

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.Submitted);
      expect(milestone.submissionNote).to.equal("Deliverables ready");
      expect(milestone.submittedAt).to.be.greaterThan(0);
    });

    it("Should allow freelancer to submit directly from Created", async function () {
      await expect(escrow.connect(freelancer).submitMilestone(projectId, 0, "Quick delivery"))
        .to.emit(escrow, "MilestoneSubmitted");

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.Submitted);
    });

    it("Should reject if not called by freelancer", async function () {
      await expect(
        escrow.connect(client).submitMilestone(projectId, 0, "Test")
      ).to.be.revertedWith("Only freelancer");
    });

    it("Should reject if already submitted", async function () {
      await escrow.connect(freelancer).submitMilestone(projectId, 0, "First");
      await expect(
        escrow.connect(freelancer).submitMilestone(projectId, 0, "Second")
      ).to.be.revertedWith("Cannot submit from current status");
    });
  });

  describe("State Machine - Approve Milestone", function () {
    let projectId: number;
    const amount = ethers.parseEther("1");

    beforeEach(async () => {
      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [amount],
        { value: amount }
      );
      await tx.wait();
      projectId = 0;
      await escrow.connect(freelancer).submitMilestone(projectId, 0, "Done");
    });

    it("Should allow client to approve and pay freelancer", async function () {
      const balanceBefore = await ethers.provider.getBalance(freelancer.address);

      await expect(escrow.connect(client).approveMilestone(projectId, 0))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(projectId, 0, amount, 0); // freelancerAmount, pmFee

      const balanceAfter = await ethers.provider.getBalance(freelancer.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.Paid);

      const project = await escrow.getProject(projectId);
      expect(project.totalPaid).to.equal(amount);
    });

    it("Should reject if not submitted", async function () {
      // Create new project for this test
      await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Test"],
        [amount],
        { value: amount }
      );

      await expect(
        escrow.connect(client).approveMilestone(1, 0)
      ).to.be.revertedWith("Milestone not submitted");
    });

    it("Should reject if not called by client", async function () {
      await expect(
        escrow.connect(freelancer).approveMilestone(projectId, 0)
      ).to.be.revertedWith("Only client");
    });
  });

  describe("State Machine - Reject Milestone", function () {
    let projectId: number;

    beforeEach(async () => {
      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [ethers.parseEther("1")],
        { value: ethers.parseEther("1") }
      );
      await tx.wait();
      projectId = 0;
      await escrow.connect(freelancer).submitMilestone(projectId, 0, "Done");
    });

    it("Should allow client to reject submission", async function () {
      await expect(escrow.connect(client).rejectMilestone(projectId, 0, "Needs more work"))
        .to.emit(escrow, "MilestoneRejected")
        .withArgs(projectId, 0, "Needs more work");

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.InProgress);
      expect(milestone.submittedAt).to.equal(0);
      expect(milestone.submissionNote).to.equal("");
    });

    it("Should allow freelancer to resubmit after rejection", async function () {
      await escrow.connect(client).rejectMilestone(projectId, 0, "Needs work");

      await expect(escrow.connect(freelancer).submitMilestone(projectId, 0, "Fixed"))
        .to.emit(escrow, "MilestoneSubmitted");

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.Submitted);
      expect(milestone.submissionNote).to.equal("Fixed");
    });

    it("Should reject if not submitted", async function () {
      await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Test"],
        [MIN_AMOUNT],
        { value: MIN_AMOUNT }
      );

      await expect(
        escrow.connect(client).rejectMilestone(1, 0, "Reason")
      ).to.be.revertedWith("Milestone not submitted");
    });
  });

  describe("PM Fee Mechanism", function () {
    it("Should calculate PM fee correctly (5% of 1 ETH = 0.05 ETH)", async function () {
      const amount = ethers.parseEther("1");
      const pmFeeBps = 500; // 5%
      const expectedPmFee = ethers.parseEther("0.05");
      const expectedFreelancerAmount = ethers.parseEther("0.95");

      await escrow.connect(client).createProject(
        freelancer.address,
        pm.address,
        pmFeeBps,
        ["Design"],
        [amount],
        { value: amount }
      );

      await escrow.connect(freelancer).submitMilestone(0, 0, "Done");

      const freelancerBalanceBefore = await ethers.provider.getBalance(freelancer.address);
      const pmBalanceBefore = await ethers.provider.getBalance(pm.address);

      await expect(escrow.connect(client).approveMilestone(0, 0))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(0, 0, expectedFreelancerAmount, expectedPmFee);

      const freelancerBalanceAfter = await ethers.provider.getBalance(freelancer.address);
      const pmBalanceAfter = await ethers.provider.getBalance(pm.address);

      expect(freelancerBalanceAfter - freelancerBalanceBefore).to.equal(expectedFreelancerAmount);
      expect(pmBalanceAfter - pmBalanceBefore).to.equal(expectedPmFee);

      const project = await escrow.getProject(0);
      expect(project.totalPmFees).to.equal(expectedPmFee);
    });

    it("Should pay full amount to freelancer when no PM", async function () {
      const amount = ethers.parseEther("1");

      await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [amount],
        { value: amount }
      );

      await escrow.connect(freelancer).submitMilestone(0, 0, "Done");

      const balanceBefore = await ethers.provider.getBalance(freelancer.address);
      await escrow.connect(client).approveMilestone(0, 0);
      const balanceAfter = await ethers.provider.getBalance(freelancer.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should handle 20% max PM fee correctly", async function () {
      const amount = ethers.parseEther("1");
      const pmFeeBps = 2000; // 20%
      const expectedPmFee = ethers.parseEther("0.2");
      const expectedFreelancerAmount = ethers.parseEther("0.8");

      await escrow.connect(client).createProject(
        freelancer.address,
        pm.address,
        pmFeeBps,
        ["Design"],
        [amount],
        { value: amount }
      );

      await escrow.connect(freelancer).submitMilestone(0, 0, "Done");

      await expect(escrow.connect(client).approveMilestone(0, 0))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(0, 0, expectedFreelancerAmount, expectedPmFee);
    });

    it("Should accumulate PM fees across milestones", async function () {
      const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
      const pmFeeBps = 1000; // 10%

      await escrow.connect(client).createProject(
        freelancer.address,
        pm.address,
        pmFeeBps,
        ["M1", "M2"],
        amounts,
        { value: ethers.parseEther("3") }
      );

      // Submit and approve first milestone
      await escrow.connect(freelancer).submitMilestone(0, 0, "M1 done");
      await escrow.connect(client).approveMilestone(0, 0);

      // Submit and approve second milestone
      await escrow.connect(freelancer).submitMilestone(0, 1, "M2 done");
      await escrow.connect(client).approveMilestone(0, 1);

      const project = await escrow.getProject(0);
      expect(project.totalPmFees).to.equal(ethers.parseEther("0.3")); // 10% of 3 ETH
      expect(project.totalPaid).to.equal(ethers.parseEther("3"));
    });
  });

  describe("Legacy Milestone Completion", function () {
    let projectId: number;

    beforeEach(async () => {
      const descriptions = ["Design", "Development"];
      const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
      const totalAmount = ethers.parseEther("3");

      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        descriptions,
        amounts,
        { value: totalAmount }
      );
      await tx.wait();
      projectId = 0;
    });

    it("Should allow client to mark milestone as completed", async function () {
      await expect(escrow.connect(client).completeMilestone(projectId, 0))
        .to.emit(escrow, "MilestoneCompleted")
        .withArgs(projectId, 0);

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.Approved);
    });

    it("Should reject if not called by client", async function () {
      await expect(
        escrow.connect(freelancer).completeMilestone(projectId, 0)
      ).to.be.revertedWith("Only client");
    });

    it("Should reject if milestone index is invalid", async function () {
      await expect(
        escrow.connect(client).completeMilestone(projectId, 99)
      ).to.be.revertedWith("Invalid milestone index");
    });

    it("Should reject if already completed/paid", async function () {
      await escrow.connect(client).completeMilestone(projectId, 0);
      await expect(
        escrow.connect(client).completeMilestone(projectId, 0)
      ).to.be.revertedWith("Already completed or paid");
    });
  });

  describe("Milestone Release", function () {
    let projectId: number;
    const amount = ethers.parseEther("1");

    beforeEach(async () => {
      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [amount],
        { value: amount }
      );
      await tx.wait();
      projectId = 0;
    });

    it("Should release payment when milestone is approved", async function () {
      await escrow.connect(client).completeMilestone(projectId, 0);

      const balanceBefore = await ethers.provider.getBalance(freelancer.address);
      await escrow.connect(other).releaseMilestone(projectId, 0);
      const balanceAfter = await ethers.provider.getBalance(freelancer.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);

      const milestone = await escrow.getMilestone(projectId, 0);
      expect(milestone.status).to.equal(Status.Paid);
    });

    it("Should auto-release payment after timeout period", async function () {
      await time.increase(TIMEOUT_PERIOD + 1);

      const balanceBefore = await ethers.provider.getBalance(freelancer.address);
      await expect(escrow.connect(other).releaseMilestone(projectId, 0))
        .to.emit(escrow, "MilestonePaid")
        .withArgs(projectId, 0, amount, true);

      const balanceAfter = await ethers.provider.getBalance(freelancer.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should reject release if not approved and not timed out", async function () {
      await expect(
        escrow.connect(other).releaseMilestone(projectId, 0)
      ).to.be.revertedWith("Not ready to release");
    });

    it("Should reject if already paid", async function () {
      await escrow.connect(client).completeMilestone(projectId, 0);
      await escrow.connect(other).releaseMilestone(projectId, 0);

      await expect(
        escrow.connect(other).releaseMilestone(projectId, 0)
      ).to.be.revertedWith("Already paid");
    });

    it("Should include PM fee in release", async function () {
      const pmFeeBps = 500; // 5%

      await escrow.connect(client).createProject(
        freelancer.address,
        pm.address,
        pmFeeBps,
        ["Design"],
        [amount],
        { value: amount }
      );

      await escrow.connect(client).completeMilestone(1, 0);

      const freelancerBefore = await ethers.provider.getBalance(freelancer.address);
      const pmBefore = await ethers.provider.getBalance(pm.address);

      await escrow.connect(other).releaseMilestone(1, 0);

      const freelancerAfter = await ethers.provider.getBalance(freelancer.address);
      const pmAfter = await ethers.provider.getBalance(pm.address);

      expect(freelancerAfter - freelancerBefore).to.equal(ethers.parseEther("0.95"));
      expect(pmAfter - pmBefore).to.equal(ethers.parseEther("0.05"));
    });
  });

  describe("Project Cancellation", function () {
    let projectId: number;
    const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
    const totalAmount = ethers.parseEther("3");

    beforeEach(async () => {
      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design", "Development"],
        amounts,
        { value: totalAmount }
      );
      await tx.wait();
      projectId = 0;
    });

    it("Should allow client to cancel project and get refund", async function () {
      const balanceBefore = await ethers.provider.getBalance(client.address);

      const tx = await escrow.connect(client).cancelProject(projectId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * tx.gasPrice!;

      const balanceAfter = await ethers.provider.getBalance(client.address);

      expect(balanceAfter).to.be.closeTo(
        balanceBefore + totalAmount - gasUsed,
        ethers.parseEther("0.001")
      );

      const project = await escrow.getProject(projectId);
      expect(project.active).to.be.false;
    });

    it("Should reject cancellation if milestone is submitted", async function () {
      await escrow.connect(freelancer).submitMilestone(projectId, 0, "Done");

      await expect(
        escrow.connect(client).cancelProject(projectId)
      ).to.be.revertedWith("Cannot cancel with approved or submitted milestones");
    });

    it("Should reject cancellation if milestone is approved", async function () {
      await escrow.connect(client).completeMilestone(projectId, 0);

      await expect(
        escrow.connect(client).cancelProject(projectId)
      ).to.be.revertedWith("Cannot cancel with approved or submitted milestones");
    });

    it("Should reject if not called by client", async function () {
      await expect(
        escrow.connect(freelancer).cancelProject(projectId)
      ).to.be.revertedWith("Only client");
    });

    it("Should reject if project already inactive", async function () {
      await escrow.connect(client).cancelProject(projectId);

      await expect(
        escrow.connect(client).cancelProject(projectId)
      ).to.be.revertedWith("Project not active");
    });
  });

  describe("Emergency Reclaim", function () {
    let projectId: number;
    const amount = ethers.parseEther("1");

    beforeEach(async () => {
      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [amount],
        { value: amount }
      );
      await tx.wait();
      projectId = 0;
    });

    it("Should allow emergency reclaim after 28 days", async function () {
      await time.increase(TIMEOUT_PERIOD * 2 + 1);

      const balanceBefore = await ethers.provider.getBalance(client.address);
      const tx = await escrow.connect(client).emergencyReclaim(projectId, 0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * tx.gasPrice!;

      const balanceAfter = await ethers.provider.getBalance(client.address);

      expect(balanceAfter).to.be.closeTo(
        balanceBefore + amount - gasUsed,
        ethers.parseEther("0.001")
      );
    });

    it("Should reject if emergency timeout not reached", async function () {
      await expect(
        escrow.connect(client).emergencyReclaim(projectId, 0)
      ).to.be.revertedWith("Emergency timeout not reached");
    });

    it("Should reject if milestone is approved", async function () {
      await escrow.connect(client).completeMilestone(projectId, 0);
      await time.increase(TIMEOUT_PERIOD * 2 + 1);

      await expect(
        escrow.connect(client).emergencyReclaim(projectId, 0)
      ).to.be.revertedWith("Cannot reclaim approved or submitted milestone");
    });

    it("Should reject if milestone is submitted", async function () {
      await escrow.connect(freelancer).submitMilestone(projectId, 0, "Done");
      await time.increase(TIMEOUT_PERIOD * 2 + 1);

      await expect(
        escrow.connect(client).emergencyReclaim(projectId, 0)
      ).to.be.revertedWith("Cannot reclaim approved or submitted milestone");
    });
  });

  describe("View Functions", function () {
    let projectId: number;

    beforeEach(async () => {
      const descriptions = ["Design", "Development", "Testing"];
      const amounts = [
        ethers.parseEther("1"),
        ethers.parseEther("2"),
        ethers.parseEther("1"),
      ];
      const totalAmount = ethers.parseEther("4");

      const tx = await escrow.connect(client).createProject(
        freelancer.address,
        pm.address,
        500,
        descriptions,
        amounts,
        { value: totalAmount }
      );
      await tx.wait();
      projectId = 0;
    });

    it("Should return all milestones correctly", async function () {
      const result = await escrow.getAllMilestones(projectId);

      expect(result.descriptions.length).to.equal(3);
      expect(result.descriptions[0]).to.equal("Design");
      expect(result.amounts[0]).to.equal(ethers.parseEther("1"));
      expect(result.statuses[0]).to.equal(Status.Created);
      expect(result.submittedAts[0]).to.equal(0);
      expect(result.submissionNotes[0]).to.equal("");
    });

    it("Should return project stats correctly", async function () {
      // Submit and approve first milestone
      await escrow.connect(freelancer).submitMilestone(projectId, 0, "Done");
      await escrow.connect(client).approveMilestone(projectId, 0);

      const stats = await escrow.getProjectStats(projectId);

      expect(stats.totalMilestones).to.equal(3);
      expect(stats.completedMilestones).to.equal(1);
      expect(stats.paidMilestones).to.equal(1);
      expect(stats.remainingAmount).to.equal(ethers.parseEther("3"));
    });

    it("Should return milestone with auto-release info", async function () {
      const milestone = await escrow.getMilestone(projectId, 0);

      expect(milestone.canAutoRelease).to.be.false;
      expect(milestone.timeUntilAutoRelease).to.be.greaterThan(0);

      await time.increase(TIMEOUT_PERIOD + 1);

      const milestoneAfter = await escrow.getMilestone(projectId, 0);
      expect(milestoneAfter.canAutoRelease).to.be.true;
      expect(milestoneAfter.timeUntilAutoRelease).to.equal(0);
    });

    it("Should return project with PM info", async function () {
      const project = await escrow.getProject(projectId);

      expect(project.pm).to.equal(pm.address);
      expect(project.pmFeeBps).to.equal(500);
      expect(project.totalPmFees).to.equal(0);
    });
  });

  describe("Full Integration Flow", function () {
    it("Should complete full project lifecycle with PM", async function () {
      const amount = ethers.parseEther("2");
      const pmFeeBps = 500; // 5%

      // 1. Client creates project
      await escrow.connect(client).createProject(
        freelancer.address,
        pm.address,
        pmFeeBps,
        ["Design", "Development", "Testing"],
        [ethers.parseEther("0.5"), ethers.parseEther("1"), ethers.parseEther("0.5")],
        { value: amount }
      );

      // 2. Freelancer starts first milestone
      await escrow.connect(freelancer).startMilestone(0, 0);
      let milestone = await escrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(Status.InProgress);

      // 3. Freelancer submits first milestone
      await escrow.connect(freelancer).submitMilestone(0, 0, "Wireframes complete");
      milestone = await escrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(Status.Submitted);

      // 4. Client approves first milestone
      const freelancerBefore = await ethers.provider.getBalance(freelancer.address);
      const pmBefore = await ethers.provider.getBalance(pm.address);

      await escrow.connect(client).approveMilestone(0, 0);

      const freelancerAfter = await ethers.provider.getBalance(freelancer.address);
      const pmAfter = await ethers.provider.getBalance(pm.address);

      // Verify payments: 0.5 ETH * 95% = 0.475 ETH to freelancer, 0.025 ETH to PM
      expect(freelancerAfter - freelancerBefore).to.equal(ethers.parseEther("0.475"));
      expect(pmAfter - pmBefore).to.equal(ethers.parseEther("0.025"));

      // 5. Verify project state
      let project = await escrow.getProject(0);
      expect(project.totalPaid).to.equal(ethers.parseEther("0.5"));
      expect(project.totalPmFees).to.equal(ethers.parseEther("0.025"));

      // 6. Complete remaining milestones
      await escrow.connect(freelancer).submitMilestone(0, 1, "Frontend done");
      await escrow.connect(client).approveMilestone(0, 1);

      await escrow.connect(freelancer).submitMilestone(0, 2, "All tests passing");
      await escrow.connect(client).approveMilestone(0, 2);

      // 7. Final verification
      project = await escrow.getProject(0);
      expect(project.totalPaid).to.equal(amount);
      expect(project.totalPmFees).to.equal(ethers.parseEther("0.1")); // 5% of 2 ETH

      const stats = await escrow.getProjectStats(0);
      expect(stats.completedMilestones).to.equal(3);
      expect(stats.paidMilestones).to.equal(3);
      expect(stats.remainingAmount).to.equal(0);
    });

    it("Should handle rejection and resubmission flow", async function () {
      await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [ethers.parseEther("1")],
        { value: ethers.parseEther("1") }
      );

      // Submit
      await escrow.connect(freelancer).submitMilestone(0, 0, "First attempt");

      // Reject
      await escrow.connect(client).rejectMilestone(0, 0, "Needs revision");
      let milestone = await escrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(Status.InProgress);

      // Resubmit
      await escrow.connect(freelancer).submitMilestone(0, 0, "Second attempt");
      milestone = await escrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(Status.Submitted);

      // Approve
      await escrow.connect(client).approveMilestone(0, 0);
      milestone = await escrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(Status.Paid);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks on approveMilestone", async function () {
      const amount = ethers.parseEther("1");
      await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [amount],
        { value: amount }
      );

      await escrow.connect(freelancer).submitMilestone(0, 0, "Done");
      await escrow.connect(client).approveMilestone(0, 0);

      const milestone = await escrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(Status.Paid);

      const project = await escrow.getProject(0);
      expect(project.totalPaid).to.equal(amount);
    });

    it("Should prevent reentrancy attacks on releaseMilestone", async function () {
      const amount = ethers.parseEther("1");
      await escrow.connect(client).createProject(
        freelancer.address,
        ZERO_ADDRESS,
        0,
        ["Design"],
        [amount],
        { value: amount }
      );

      await escrow.connect(client).completeMilestone(0, 0);
      await escrow.connect(other).releaseMilestone(0, 0);

      const milestone = await escrow.getMilestone(0, 0);
      expect(milestone.status).to.equal(Status.Paid);

      const project = await escrow.getProject(0);
      expect(project.totalPaid).to.equal(amount);
    });
  });
});
