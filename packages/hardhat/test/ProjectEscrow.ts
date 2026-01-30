import { expect } from "chai";
import { ethers } from "hardhat";
import { ProjectEscrow } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ProjectEscrow", function () {
  let escrow: ProjectEscrow;
  let client: HardhatEthersSigner;
  let worker1: HardhatEthersSigner;
  let worker2: HardhatEthersSigner;
  let pm: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const ONE_ETH = ethers.parseEther("1");
  const HALF_ETH = ethers.parseEther("0.5");
  const PM_FEE_BPS = 500n; // 5%

  beforeEach(async () => {
    [client, worker1, worker2, pm, other] = await ethers.getSigners();
    const ProjectEscrowFactory = await ethers.getContractFactory("ProjectEscrow");
    escrow = await ProjectEscrowFactory.deploy();
    await escrow.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should initialize with zero project count", async function () {
      expect(await escrow.projectCount()).to.equal(0);
    });

    it("Should have correct constants", async function () {
      expect(await escrow.MAX_PM_FEE_BPS()).to.equal(2000);
      expect(await escrow.ASSIGNMENT_TIMEOUT()).to.equal(7 * 24 * 60 * 60);
    });
  });

  describe("Project Creation", function () {
    it("Should create project without initial assignees", async function () {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task 1", "Task 2"],
        [HALF_ETH, HALF_ETH],
        [],
        { value: ONE_ETH }
      );

      expect(await escrow.projectCount()).to.equal(1);

      const [projectClient, projectPm, projectPmFeeBps, totalAmount] = await escrow.getProject(0);
      expect(projectClient).to.equal(client.address);
      expect(projectPm).to.equal(pm.address);
      expect(projectPmFeeBps).to.equal(PM_FEE_BPS);
      expect(totalAmount).to.equal(ONE_ETH);
    });

    it("Should create project with initial assignees", async function () {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task 1", "Task 2"],
        [HALF_ETH, HALF_ETH],
        [worker1.address, worker2.address],
        { value: ONE_ETH }
      );

      const milestone0 = await escrow.getMilestone(0, 0);
      const milestone1 = await escrow.getMilestone(0, 1);

      expect(milestone0.assignee).to.equal(worker1.address);
      expect(milestone0.status).to.equal(1); // Assigned
      expect(milestone1.assignee).to.equal(worker2.address);
      expect(milestone1.status).to.equal(1); // Assigned
    });

    it("Should create project without PM", async function () {
      await escrow.connect(client).createProject(
        ethers.ZeroAddress,
        0,
        ["Task 1"],
        [ONE_ETH],
        [],
        { value: ONE_ETH }
      );

      const [, projectPm, projectPmFeeBps] = await escrow.getProject(0);
      expect(projectPm).to.equal(ethers.ZeroAddress);
      expect(projectPmFeeBps).to.equal(0);
    });

    it("Should reject PM fee without PM", async function () {
      await expect(
        escrow.connect(client).createProject(
          ethers.ZeroAddress,
          PM_FEE_BPS,
          ["Task 1"],
          [ONE_ETH],
          [],
          { value: ONE_ETH }
        )
      ).to.be.revertedWith("Cannot set fee without PM");
    });

    it("Should reject PM fee over 20%", async function () {
      await expect(
        escrow.connect(client).createProject(
          pm.address,
          2001,
          ["Task 1"],
          [ONE_ETH],
          [],
          { value: ONE_ETH }
        )
      ).to.be.revertedWith("PM fee too high");
    });

    it("Should reject client as assignee", async function () {
      await expect(
        escrow.connect(client).createProject(
          pm.address,
          PM_FEE_BPS,
          ["Task 1"],
          [ONE_ETH],
          [client.address],
          { value: ONE_ETH }
        )
      ).to.be.revertedWith("Client cannot be assignee");
    });

    it("Should reject PM as assignee", async function () {
      await expect(
        escrow.connect(client).createProject(
          pm.address,
          PM_FEE_BPS,
          ["Task 1"],
          [ONE_ETH],
          [pm.address],
          { value: ONE_ETH }
        )
      ).to.be.revertedWith("PM cannot be assignee");
    });
  });

  describe("Assignment Flow", function () {
    beforeEach(async () => {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task 1"],
        [ONE_ETH],
        [],
        { value: ONE_ETH }
      );
    });

    describe("assignMilestone", function () {
      it("Should allow client to assign", async function () {
        await expect(escrow.connect(client).assignMilestone(0, 0, worker1.address))
          .to.emit(escrow, "MilestoneAssigned")
          .withArgs(0, 0, worker1.address, client.address);

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.assignee).to.equal(worker1.address);
        expect(milestone.status).to.equal(1); // Assigned
      });

      it("Should allow PM to assign", async function () {
        await expect(escrow.connect(pm).assignMilestone(0, 0, worker1.address))
          .to.emit(escrow, "MilestoneAssigned")
          .withArgs(0, 0, worker1.address, pm.address);
      });

      it("Should reject assignment by others", async function () {
        await expect(
          escrow.connect(other).assignMilestone(0, 0, worker1.address)
        ).to.be.revertedWith("Only client or PM");
      });

      it("Should reject assignment to client", async function () {
        await expect(
          escrow.connect(client).assignMilestone(0, 0, client.address)
        ).to.be.revertedWith("Client cannot be assignee");
      });

      it("Should reject assignment to PM", async function () {
        await expect(
          escrow.connect(client).assignMilestone(0, 0, pm.address)
        ).to.be.revertedWith("PM cannot be assignee");
      });
    });

    describe("acceptMilestone", function () {
      beforeEach(async () => {
        await escrow.connect(client).assignMilestone(0, 0, worker1.address);
      });

      it("Should allow assignee to accept", async function () {
        await expect(escrow.connect(worker1).acceptMilestone(0, 0))
          .to.emit(escrow, "MilestoneAccepted")
          .withArgs(0, 0, worker1.address);

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(2); // Accepted

        const timestamps = await escrow.getMilestoneTimestamps(0, 0);
        expect(timestamps.acceptedAt).to.be.gt(0);
      });

      it("Should reject acceptance by non-assignee", async function () {
        await expect(
          escrow.connect(worker2).acceptMilestone(0, 0)
        ).to.be.revertedWith("Only assignee");
      });

      it("Should reject acceptance of unassigned milestone", async function () {
        await escrow.connect(client).createProject(
          ethers.ZeroAddress,
          0,
          ["Task 2"],
          [HALF_ETH],
          [],
          { value: HALF_ETH }
        );

        await expect(
          escrow.connect(worker1).acceptMilestone(1, 0)
        ).to.be.revertedWith("Only assignee");
      });
    });

    describe("declineMilestone", function () {
      beforeEach(async () => {
        await escrow.connect(client).assignMilestone(0, 0, worker1.address);
      });

      it("Should allow assignee to decline", async function () {
        await expect(escrow.connect(worker1).declineMilestone(0, 0, "Too busy"))
          .to.emit(escrow, "MilestoneDeclined")
          .withArgs(0, 0, worker1.address, "Too busy");

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.assignee).to.equal(ethers.ZeroAddress);
        expect(milestone.status).to.equal(0); // Created
      });

      it("Should reject decline by non-assignee", async function () {
        await expect(
          escrow.connect(worker2).declineMilestone(0, 0, "Reason")
        ).to.be.revertedWith("Only assignee");
      });
    });

    describe("unassignMilestone", function () {
      beforeEach(async () => {
        await escrow.connect(client).assignMilestone(0, 0, worker1.address);
      });

      it("Should allow client to unassign", async function () {
        await expect(escrow.connect(client).unassignMilestone(0, 0))
          .to.emit(escrow, "MilestoneUnassigned")
          .withArgs(0, 0, worker1.address);

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.assignee).to.equal(ethers.ZeroAddress);
        expect(milestone.status).to.equal(0); // Created
      });

      it("Should allow PM to unassign", async function () {
        await escrow.connect(pm).unassignMilestone(0, 0);
        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(0);
      });

      it("Should reject unassign after acceptance", async function () {
        await escrow.connect(worker1).acceptMilestone(0, 0);
        await expect(
          escrow.connect(client).unassignMilestone(0, 0)
        ).to.be.revertedWith("Can only unassign from Assigned status");
      });
    });
  });

  describe("Work Flow", function () {
    beforeEach(async () => {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task 1"],
        [ONE_ETH],
        [worker1.address],
        { value: ONE_ETH }
      );
      await escrow.connect(worker1).acceptMilestone(0, 0);
    });

    describe("startMilestone", function () {
      it("Should allow assignee to start", async function () {
        await expect(escrow.connect(worker1).startMilestone(0, 0))
          .to.emit(escrow, "MilestoneStarted")
          .withArgs(0, 0);

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(3); // InProgress
      });

      it("Should reject start before acceptance", async function () {
        await escrow.connect(client).createProject(
          ethers.ZeroAddress,
          0,
          ["Task 2"],
          [HALF_ETH],
          [worker2.address],
          { value: HALF_ETH }
        );

        await expect(
          escrow.connect(worker2).startMilestone(1, 0)
        ).to.be.revertedWith("Milestone not in Accepted status");
      });
    });

    describe("submitMilestone", function () {
      it("Should allow submit from Accepted", async function () {
        await expect(escrow.connect(worker1).submitMilestone(0, 0, "Done!"))
          .to.emit(escrow, "MilestoneSubmitted")
          .withArgs(0, 0, "Done!");

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(4); // Submitted
        expect(milestone.submissionNote).to.equal("Done!");
      });

      it("Should allow submit from InProgress", async function () {
        await escrow.connect(worker1).startMilestone(0, 0);
        await escrow.connect(worker1).submitMilestone(0, 0, "Completed work");

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(4); // Submitted
      });

      it("Should reject submit by non-assignee", async function () {
        await expect(
          escrow.connect(worker2).submitMilestone(0, 0, "Note")
        ).to.be.revertedWith("Only assignee");
      });
    });
  });

  describe("Approval Flow", function () {
    beforeEach(async () => {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task 1"],
        [ONE_ETH],
        [worker1.address],
        { value: ONE_ETH }
      );
      await escrow.connect(worker1).acceptMilestone(0, 0);
      await escrow.connect(worker1).submitMilestone(0, 0, "Work done");
    });

    describe("approveMilestone", function () {
      it("Should pay assignee and PM correctly", async function () {
        const pmFee = (ONE_ETH * PM_FEE_BPS) / 10000n;
        const assigneeAmount = ONE_ETH - pmFee;

        const workerBefore = await ethers.provider.getBalance(worker1.address);
        const pmBefore = await ethers.provider.getBalance(pm.address);

        await expect(escrow.connect(client).approveMilestone(0, 0))
          .to.emit(escrow, "MilestoneApproved")
          .withArgs(0, 0, assigneeAmount, pmFee);

        const workerAfter = await ethers.provider.getBalance(worker1.address);
        const pmAfter = await ethers.provider.getBalance(pm.address);

        expect(workerAfter - workerBefore).to.equal(assigneeAmount);
        expect(pmAfter - pmBefore).to.equal(pmFee);

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(6); // Paid
      });

      it("Should reject approval by non-client", async function () {
        await expect(
          escrow.connect(pm).approveMilestone(0, 0)
        ).to.be.revertedWith("Only client");
      });
    });

    describe("rejectMilestone", function () {
      it("Should return to InProgress", async function () {
        await expect(escrow.connect(client).rejectMilestone(0, 0, "Needs revision"))
          .to.emit(escrow, "MilestoneRejected")
          .withArgs(0, 0, "Needs revision");

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(3); // InProgress
        expect(milestone.submissionNote).to.equal("");
      });

      it("Should allow resubmission after rejection", async function () {
        await escrow.connect(client).rejectMilestone(0, 0, "Fix issues");
        await escrow.connect(worker1).submitMilestone(0, 0, "Fixed!");

        const milestone = await escrow.getMilestone(0, 0);
        expect(milestone.status).to.equal(4); // Submitted
        expect(milestone.submissionNote).to.equal("Fixed!");
      });
    });
  });

  describe("Different Workers Per Milestone", function () {
    it("Should allow different workers for each milestone", async function () {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task A", "Task B", "Task C"],
        [HALF_ETH, HALF_ETH, HALF_ETH],
        [worker1.address, worker2.address, ethers.ZeroAddress],
        { value: ethers.parseEther("1.5") }
      );

      const milestone0 = await escrow.getMilestone(0, 0);
      const milestone1 = await escrow.getMilestone(0, 1);
      const milestone2 = await escrow.getMilestone(0, 2);

      expect(milestone0.assignee).to.equal(worker1.address);
      expect(milestone1.assignee).to.equal(worker2.address);
      expect(milestone2.assignee).to.equal(ethers.ZeroAddress);

      expect(milestone0.status).to.equal(1); // Assigned
      expect(milestone1.status).to.equal(1); // Assigned
      expect(milestone2.status).to.equal(0); // Created
    });

    it("Should process payments to different workers", async function () {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task A", "Task B"],
        [HALF_ETH, HALF_ETH],
        [worker1.address, worker2.address],
        { value: ONE_ETH }
      );

      // Worker1 completes Task A
      await escrow.connect(worker1).acceptMilestone(0, 0);
      await escrow.connect(worker1).submitMilestone(0, 0, "Task A done");
      await escrow.connect(client).approveMilestone(0, 0);

      // Worker2 completes Task B
      await escrow.connect(worker2).acceptMilestone(0, 1);
      await escrow.connect(worker2).submitMilestone(0, 1, "Task B done");
      await escrow.connect(client).approveMilestone(0, 1);

      const [, , , , totalPaid, totalPmFees] = await escrow.getProject(0);
      expect(totalPaid).to.equal(ONE_ETH);
      expect(totalPmFees).to.equal((ONE_ETH * PM_FEE_BPS) / 10000n);
    });
  });

  describe("Project Stats", function () {
    it("Should track assignment and acceptance stats", async function () {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task 1", "Task 2", "Task 3"],
        [HALF_ETH, HALF_ETH, HALF_ETH],
        [],
        { value: ethers.parseEther("1.5") }
      );

      // Assign first two
      await escrow.connect(client).assignMilestone(0, 0, worker1.address);
      await escrow.connect(client).assignMilestone(0, 1, worker2.address);

      let stats = await escrow.getProjectStats(0);
      expect(stats.totalMilestones).to.equal(3);
      expect(stats.assignedMilestones).to.equal(2);
      expect(stats.acceptedMilestones).to.equal(0);

      // Accept first
      await escrow.connect(worker1).acceptMilestone(0, 0);

      stats = await escrow.getProjectStats(0);
      expect(stats.acceptedMilestones).to.equal(1);
    });
  });

  describe("getAddressRole", function () {
    it("Should return correct role information", async function () {
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Task 1", "Task 2"],
        [HALF_ETH, HALF_ETH],
        [worker1.address, worker1.address],
        { value: ONE_ETH }
      );

      const clientRole = await escrow.getAddressRole(0, client.address);
      expect(clientRole.isClient).to.be.true;
      expect(clientRole.isPM).to.be.false;
      expect(clientRole.assignedMilestones.length).to.equal(0);

      const pmRole = await escrow.getAddressRole(0, pm.address);
      expect(pmRole.isClient).to.be.false;
      expect(pmRole.isPM).to.be.true;

      const workerRole = await escrow.getAddressRole(0, worker1.address);
      expect(workerRole.isClient).to.be.false;
      expect(workerRole.isPM).to.be.false;
      expect(workerRole.assignedMilestones.length).to.equal(2);
      expect(workerRole.assignedMilestones[0]).to.equal(0);
      expect(workerRole.assignedMilestones[1]).to.equal(1);
    });
  });

  describe("Cancel Project", function () {
    it("Should refund unassigned milestones", async function () {
      await escrow.connect(client).createProject(
        ethers.ZeroAddress,
        0,
        ["Task 1", "Task 2"],
        [HALF_ETH, HALF_ETH],
        [],
        { value: ONE_ETH }
      );

      const balanceBefore = await ethers.provider.getBalance(client.address);
      const tx = await escrow.connect(client).cancelProject(0);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(client.address);

      expect(balanceAfter - balanceBefore + gasCost).to.equal(ONE_ETH);
    });

    it("Should prevent cancel with submitted work", async function () {
      await escrow.connect(client).createProject(
        ethers.ZeroAddress,
        0,
        ["Task 1"],
        [ONE_ETH],
        [worker1.address],
        { value: ONE_ETH }
      );

      await escrow.connect(worker1).acceptMilestone(0, 0);
      await escrow.connect(worker1).submitMilestone(0, 0, "Done");

      await expect(
        escrow.connect(client).cancelProject(0)
      ).to.be.revertedWith("Cannot cancel with submitted or approved milestones");
    });
  });

  describe("Full Workflow Integration", function () {
    it("Should complete full workflow: assign → accept → start → submit → approve", async function () {
      // Create project without initial assignees
      await escrow.connect(client).createProject(
        pm.address,
        PM_FEE_BPS,
        ["Design", "Development"],
        [HALF_ETH, HALF_ETH],
        [],
        { value: ONE_ETH }
      );

      // Assign workers (PM does this)
      await escrow.connect(pm).assignMilestone(0, 0, worker1.address);
      await escrow.connect(pm).assignMilestone(0, 1, worker2.address);

      // Workers accept
      await escrow.connect(worker1).acceptMilestone(0, 0);
      await escrow.connect(worker2).acceptMilestone(0, 1);

      // Workers start
      await escrow.connect(worker1).startMilestone(0, 0);
      await escrow.connect(worker2).startMilestone(0, 1);

      // Workers submit
      await escrow.connect(worker1).submitMilestone(0, 0, "Design complete");
      await escrow.connect(worker2).submitMilestone(0, 1, "Dev complete");

      // Client approves
      await escrow.connect(client).approveMilestone(0, 0);
      await escrow.connect(client).approveMilestone(0, 1);

      // Verify final state
      const [, , , totalAmount, totalPaid] = await escrow.getProject(0);
      expect(totalPaid).to.equal(totalAmount);
      expect(totalPaid).to.equal(ONE_ETH);
    });

    it("Should handle decline and reassignment", async function () {
      await escrow.connect(client).createProject(
        ethers.ZeroAddress,
        0,
        ["Task 1"],
        [ONE_ETH],
        [worker1.address],
        { value: ONE_ETH }
      );

      // Worker1 declines
      await escrow.connect(worker1).declineMilestone(0, 0, "Not available");

      // Reassign to worker2
      await escrow.connect(client).assignMilestone(0, 0, worker2.address);

      // Worker2 accepts and completes
      await escrow.connect(worker2).acceptMilestone(0, 0);
      await escrow.connect(worker2).submitMilestone(0, 0, "Done!");
      await escrow.connect(client).approveMilestone(0, 0);

      const milestone = await escrow.getMilestone(0, 0);
      expect(milestone.assignee).to.equal(worker2.address);
      expect(milestone.status).to.equal(6); // Paid
    });
  });
});
