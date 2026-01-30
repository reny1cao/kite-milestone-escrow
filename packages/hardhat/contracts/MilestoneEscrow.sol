// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MilestoneEscrow
 * @notice Milestone-based escrow for freelance payments with PM fee mechanism
 * @dev Enhanced version with status state machine, PM fees, and role-based actions
 */
contract MilestoneEscrow is ReentrancyGuard {
    enum MilestoneStatus { Created, InProgress, Submitted, Approved, Paid }

    struct Milestone {
        string description;
        uint256 amount;
        uint256 createdAt;
        uint256 submittedAt;
        MilestoneStatus status;
        string submissionNote;
    }

    struct Project {
        address client;
        address freelancer;
        address pm;
        uint256 pmFeeBps;
        uint256 totalAmount;
        uint256 totalPaid;
        uint256 totalPmFees;
        bool active;
        Milestone[] milestones;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;

    uint256 public constant TIMEOUT_PERIOD = 14 days;
    uint256 public constant MIN_MILESTONE_AMOUNT = 0.001 ether;
    uint256 public constant MAX_PM_FEE_BPS = 2000; // 20%
    uint256 public constant BPS_DENOMINATOR = 10000;

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        address indexed freelancer,
        address pm,
        uint256 pmFeeBps,
        uint256 totalAmount,
        uint256 milestoneCount
    );
    event MilestoneStarted(uint256 indexed projectId, uint256 milestoneIndex);
    event MilestoneSubmitted(uint256 indexed projectId, uint256 milestoneIndex, string note);
    event MilestoneApproved(uint256 indexed projectId, uint256 milestoneIndex, uint256 freelancerAmount, uint256 pmFee);
    event MilestoneRejected(uint256 indexed projectId, uint256 milestoneIndex, string reason);
    event MilestoneCompleted(uint256 indexed projectId, uint256 milestoneIndex);
    event MilestonePaid(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        uint256 amount,
        bool autoReleased
    );
    event ProjectCancelled(uint256 indexed projectId, uint256 refundAmount);

    modifier onlyClient(uint256 projectId) {
        require(msg.sender == projects[projectId].client, "Only client");
        _;
    }

    modifier onlyFreelancer(uint256 projectId) {
        require(msg.sender == projects[projectId].freelancer, "Only freelancer");
        _;
    }

    modifier projectActive(uint256 projectId) {
        require(projects[projectId].active, "Project not active");
        _;
    }

    modifier validMilestoneIndex(uint256 projectId, uint256 milestoneIndex) {
        require(milestoneIndex < projects[projectId].milestones.length, "Invalid milestone index");
        _;
    }

    /**
     * @notice Create new project with milestones and optional PM
     * @param freelancer Address of the freelancer
     * @param pm Address of the project manager (can be address(0) for no PM)
     * @param pmFeeBps PM fee in basis points (0-2000, i.e., 0-20%)
     * @param descriptions Array of milestone descriptions
     * @param amounts Array of milestone amounts (in wei)
     */
    function createProject(
        address freelancer,
        address pm,
        uint256 pmFeeBps,
        string[] memory descriptions,
        uint256[] memory amounts
    ) external payable returns (uint256) {
        require(freelancer != address(0), "Invalid freelancer address");
        require(freelancer != msg.sender, "Client cannot be freelancer");
        require(descriptions.length == amounts.length, "Array length mismatch");
        require(descriptions.length > 0, "Need at least one milestone");
        require(descriptions.length <= 50, "Too many milestones");
        require(pmFeeBps <= MAX_PM_FEE_BPS, "PM fee too high");

        // If PM is set, fee must be > 0; if no PM, fee must be 0
        if (pm != address(0)) {
            require(pm != msg.sender, "Client cannot be PM");
            require(pm != freelancer, "Freelancer cannot be PM");
        } else {
            require(pmFeeBps == 0, "Cannot set fee without PM");
        }

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] >= MIN_MILESTONE_AMOUNT, "Amount too small");
            require(bytes(descriptions[i]).length > 0, "Description required");
            require(bytes(descriptions[i]).length <= 500, "Description too long");
            total += amounts[i];
        }
        require(msg.value == total, "Incorrect payment amount");

        uint256 projectId = projectCount++;
        Project storage project = projects[projectId];
        project.client = msg.sender;
        project.freelancer = freelancer;
        project.pm = pm;
        project.pmFeeBps = pmFeeBps;
        project.totalAmount = total;
        project.totalPaid = 0;
        project.totalPmFees = 0;
        project.active = true;

        for (uint256 i = 0; i < descriptions.length; i++) {
            project.milestones.push(Milestone({
                description: descriptions[i],
                amount: amounts[i],
                createdAt: block.timestamp,
                submittedAt: 0,
                status: MilestoneStatus.Created,
                submissionNote: ""
            }));
        }

        emit ProjectCreated(projectId, msg.sender, freelancer, pm, pmFeeBps, total, descriptions.length);
        return projectId;
    }

    /**
     * @notice Freelancer starts working on a milestone
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function startMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        onlyFreelancer(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Created, "Milestone not in Created status");

        milestone.status = MilestoneStatus.InProgress;
        emit MilestoneStarted(projectId, milestoneIndex);
    }

    /**
     * @notice Freelancer submits a completed milestone
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     * @param note Submission note describing deliverables
     */
    function submitMilestone(uint256 projectId, uint256 milestoneIndex, string memory note)
        external
        onlyFreelancer(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(
            milestone.status == MilestoneStatus.InProgress || milestone.status == MilestoneStatus.Created,
            "Cannot submit from current status"
        );

        milestone.status = MilestoneStatus.Submitted;
        milestone.submittedAt = block.timestamp;
        milestone.submissionNote = note;

        emit MilestoneSubmitted(projectId, milestoneIndex, note);
    }

    /**
     * @notice Client approves a milestone and triggers payment
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function approveMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        nonReentrant
        onlyClient(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Project storage project = projects[projectId];
        Milestone storage milestone = project.milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Submitted, "Milestone not submitted");

        // Calculate PM fee
        uint256 pmFee = (milestone.amount * project.pmFeeBps) / BPS_DENOMINATOR;
        uint256 freelancerAmount = milestone.amount - pmFee;

        // Update state before external calls
        milestone.status = MilestoneStatus.Paid;
        project.totalPaid += milestone.amount;
        project.totalPmFees += pmFee;

        // Transfer to freelancer
        (bool s1,) = project.freelancer.call{value: freelancerAmount}("");
        require(s1, "Freelancer transfer failed");

        // Transfer to PM (if exists and fee > 0)
        if (project.pm != address(0) && pmFee > 0) {
            (bool s2,) = project.pm.call{value: pmFee}("");
            require(s2, "PM transfer failed");
        }

        emit MilestoneApproved(projectId, milestoneIndex, freelancerAmount, pmFee);
    }

    /**
     * @notice Client rejects a milestone submission
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     * @param reason Reason for rejection
     */
    function rejectMilestone(uint256 projectId, uint256 milestoneIndex, string memory reason)
        external
        onlyClient(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Submitted, "Milestone not submitted");

        milestone.status = MilestoneStatus.InProgress;
        milestone.submittedAt = 0;
        milestone.submissionNote = "";

        emit MilestoneRejected(projectId, milestoneIndex, reason);
    }

    /**
     * @notice Client marks milestone as completed (legacy support)
     * @dev Equivalent to approve for backwards compatibility
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function completeMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        onlyClient(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(
            milestone.status != MilestoneStatus.Approved && milestone.status != MilestoneStatus.Paid,
            "Already completed or paid"
        );

        milestone.status = MilestoneStatus.Approved;
        emit MilestoneCompleted(projectId, milestoneIndex);
    }

    /**
     * @notice Release payment for completed/approved milestone
     * @dev Can be called by anyone, but requires milestone to be completed/approved or timed out
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function releaseMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        nonReentrant
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Project storage project = projects[projectId];
        require(project.active, "Project not active");

        Milestone storage milestone = project.milestones[milestoneIndex];
        require(milestone.status != MilestoneStatus.Paid, "Already paid");

        bool isApproved = milestone.status == MilestoneStatus.Approved;
        bool isTimedOut = block.timestamp >= milestone.createdAt + TIMEOUT_PERIOD;
        bool canRelease = isApproved || isTimedOut;

        require(canRelease, "Not ready to release");

        // Calculate PM fee
        uint256 pmFee = (milestone.amount * project.pmFeeBps) / BPS_DENOMINATOR;
        uint256 freelancerAmount = milestone.amount - pmFee;

        // Update state before external calls
        milestone.status = MilestoneStatus.Paid;
        project.totalPaid += milestone.amount;
        project.totalPmFees += pmFee;

        // Transfer to freelancer
        (bool s1,) = project.freelancer.call{value: freelancerAmount}("");
        require(s1, "Transfer failed");

        // Transfer to PM (if exists and fee > 0)
        if (project.pm != address(0) && pmFee > 0) {
            (bool s2,) = project.pm.call{value: pmFee}("");
            require(s2, "PM transfer failed");
        }

        emit MilestonePaid(projectId, milestoneIndex, milestone.amount, isTimedOut);
    }

    /**
     * @notice Cancel project and refund unpaid milestones to client
     * @dev Can only be called by client for projects with no approved/submitted milestones
     * @param projectId The project ID
     */
    function cancelProject(uint256 projectId)
        external
        onlyClient(projectId)
        projectActive(projectId)
        nonReentrant
    {
        Project storage project = projects[projectId];

        // Calculate refund amount (only unpaid milestones that aren't approved/submitted)
        uint256 refundAmount = 0;
        bool hasInProgressWork = false;

        for (uint256 i = 0; i < project.milestones.length; i++) {
            MilestoneStatus status = project.milestones[i].status;
            if (status == MilestoneStatus.Approved || status == MilestoneStatus.Submitted) {
                hasInProgressWork = true;
                break;
            }
            if (status != MilestoneStatus.Paid) {
                refundAmount += project.milestones[i].amount;
            }
        }

        require(!hasInProgressWork, "Cannot cancel with approved or submitted milestones");
        require(refundAmount > 0, "No funds to refund");

        // Mark project as inactive and all unpaid milestones as paid
        project.active = false;
        for (uint256 i = 0; i < project.milestones.length; i++) {
            if (project.milestones[i].status != MilestoneStatus.Paid) {
                project.milestones[i].status = MilestoneStatus.Paid;
            }
        }

        // Refund to client
        (bool success, ) = project.client.call{value: refundAmount}("");
        require(success, "Refund failed");

        emit ProjectCancelled(projectId, refundAmount);
    }

    /**
     * @notice Emergency withdrawal for specific milestone
     * @dev Client can reclaim funds from a milestone that cannot be paid
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function emergencyReclaim(uint256 projectId, uint256 milestoneIndex)
        external
        onlyClient(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
        nonReentrant
    {
        Project storage project = projects[projectId];
        Milestone storage milestone = project.milestones[milestoneIndex];

        require(milestone.status != MilestoneStatus.Paid, "Already paid");
        require(
            milestone.status != MilestoneStatus.Approved && milestone.status != MilestoneStatus.Submitted,
            "Cannot reclaim approved or submitted milestone"
        );

        // Must wait longer than normal timeout
        uint256 emergencyTimeout = milestone.createdAt + (TIMEOUT_PERIOD * 2);
        require(block.timestamp >= emergencyTimeout, "Emergency timeout not reached");

        // Mark as paid to prevent double withdrawal
        milestone.status = MilestoneStatus.Paid;

        // Return to client
        (bool success, ) = project.client.call{value: milestone.amount}("");
        require(success, "Emergency reclaim failed");

        emit MilestonePaid(projectId, milestoneIndex, milestone.amount, true);
    }

    /**
     * @notice Get project details
     */
    function getProject(uint256 projectId) external view returns (
        address client,
        address freelancer,
        address pm,
        uint256 pmFeeBps,
        uint256 totalAmount,
        uint256 totalPaid,
        uint256 totalPmFees,
        bool active,
        uint256 milestoneCount
    ) {
        Project storage project = projects[projectId];
        return (
            project.client,
            project.freelancer,
            project.pm,
            project.pmFeeBps,
            project.totalAmount,
            project.totalPaid,
            project.totalPmFees,
            project.active,
            project.milestones.length
        );
    }

    /**
     * @notice Get milestone details
     */
    function getMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        view
        validMilestoneIndex(projectId, milestoneIndex)
        returns (
            string memory description,
            uint256 amount,
            uint256 createdAt,
            uint256 submittedAt,
            MilestoneStatus status,
            string memory submissionNote,
            bool canAutoRelease,
            uint256 timeUntilAutoRelease
        )
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        bool autoRelease = block.timestamp >= milestone.createdAt + TIMEOUT_PERIOD;

        uint256 timeLeft = 0;
        if (!autoRelease) {
            timeLeft = (milestone.createdAt + TIMEOUT_PERIOD) - block.timestamp;
        }

        return (
            milestone.description,
            milestone.amount,
            milestone.createdAt,
            milestone.submittedAt,
            milestone.status,
            milestone.submissionNote,
            autoRelease,
            timeLeft
        );
    }

    /**
     * @notice Get all milestones for a project
     * @dev Returns arrays of milestone data for easier frontend consumption
     */
    function getAllMilestones(uint256 projectId) external view returns (
        string[] memory descriptions,
        uint256[] memory amounts,
        MilestoneStatus[] memory statuses,
        uint256[] memory submittedAts,
        string[] memory submissionNotes
    ) {
        Project storage project = projects[projectId];
        uint256 length = project.milestones.length;

        descriptions = new string[](length);
        amounts = new uint256[](length);
        statuses = new MilestoneStatus[](length);
        submittedAts = new uint256[](length);
        submissionNotes = new string[](length);

        for (uint256 i = 0; i < length; i++) {
            Milestone storage milestone = project.milestones[i];
            descriptions[i] = milestone.description;
            amounts[i] = milestone.amount;
            statuses[i] = milestone.status;
            submittedAts[i] = milestone.submittedAt;
            submissionNotes[i] = milestone.submissionNote;
        }

        return (descriptions, amounts, statuses, submittedAts, submissionNotes);
    }

    /**
     * @notice Get project statistics
     */
    function getProjectStats(uint256 projectId) external view returns (
        uint256 totalMilestones,
        uint256 completedMilestones,
        uint256 paidMilestones,
        uint256 remainingAmount
    ) {
        Project storage project = projects[projectId];
        uint256 completed = 0;
        uint256 paid = 0;

        for (uint256 i = 0; i < project.milestones.length; i++) {
            MilestoneStatus status = project.milestones[i].status;
            if (status == MilestoneStatus.Approved || status == MilestoneStatus.Paid) {
                completed++;
            }
            if (status == MilestoneStatus.Paid) {
                paid++;
            }
        }

        return (
            project.milestones.length,
            completed,
            paid,
            project.totalAmount - project.totalPaid
        );
    }
}
