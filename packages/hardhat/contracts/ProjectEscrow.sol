// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ProjectEscrow
 * @notice Milestone-based escrow with per-milestone assignment and explicit acceptance
 * @dev Designed for AI-compatible worker matching - each milestone can have a different assignee
 *
 * State Machine:
 *   Created → Assigned → Accepted → InProgress → Submitted → Approved → Paid
 *                     ↘ Declined (returns to Created, clears assignee)
 *
 * Roles:
 *   - Client: Project owner, funds milestones, approves/rejects work
 *   - PM: Optional project manager, can assign workers, earns commission
 *   - Assignee: Worker assigned to a specific milestone (can vary per milestone)
 */
contract ProjectEscrow is ReentrancyGuard {
    enum MilestoneStatus {
        Created,    // Initial state, no assignee
        Assigned,   // Assignee set, waiting for acceptance
        Accepted,   // Assignee accepted, can start work
        InProgress, // Work started
        Submitted,  // Work submitted for review
        Approved,   // Client approved (legacy, for backwards compat)
        Paid        // Payment released
    }

    struct Milestone {
        string description;
        uint256 amount;
        address assignee;           // Worker assigned to this milestone
        uint256 createdAt;
        uint256 assignedAt;         // When assignee was set
        uint256 acceptedAt;         // When assignee accepted
        uint256 submittedAt;
        MilestoneStatus status;
        string submissionNote;
    }

    struct Project {
        address client;
        address pm;                 // Optional project manager
        uint256 pmFeeBps;           // PM fee in basis points (0-2000)
        uint256 totalAmount;
        uint256 totalPaid;
        uint256 totalPmFees;
        bool active;
        Milestone[] milestones;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;

    uint256 public constant TIMEOUT_PERIOD = 14 days;
    uint256 public constant ASSIGNMENT_TIMEOUT = 7 days;  // Auto-decline if not accepted
    uint256 public constant MIN_MILESTONE_AMOUNT = 0.001 ether;
    uint256 public constant MAX_PM_FEE_BPS = 2000; // 20%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ Events ============

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        address pm,
        uint256 pmFeeBps,
        uint256 totalAmount,
        uint256 milestoneCount
    );

    event MilestoneAssigned(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        address indexed assignee,
        address indexed assignedBy
    );

    event MilestoneAccepted(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        address indexed assignee
    );

    event MilestoneDeclined(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        address indexed assignee,
        string reason
    );

    event MilestoneUnassigned(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        address indexed previousAssignee
    );

    event MilestoneStarted(uint256 indexed projectId, uint256 milestoneIndex);

    event MilestoneSubmitted(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        string note
    );

    event MilestoneApproved(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        uint256 assigneeAmount,
        uint256 pmFee
    );

    event MilestoneRejected(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        string reason
    );

    event MilestonePaid(
        uint256 indexed projectId,
        uint256 milestoneIndex,
        uint256 amount,
        bool autoReleased
    );

    event ProjectCancelled(uint256 indexed projectId, uint256 refundAmount);

    // ============ Modifiers ============

    modifier onlyClient(uint256 projectId) {
        require(msg.sender == projects[projectId].client, "Only client");
        _;
    }

    modifier onlyClientOrPM(uint256 projectId) {
        Project storage project = projects[projectId];
        require(
            msg.sender == project.client ||
            (project.pm != address(0) && msg.sender == project.pm),
            "Only client or PM"
        );
        _;
    }

    modifier onlyAssignee(uint256 projectId, uint256 milestoneIndex) {
        require(
            msg.sender == projects[projectId].milestones[milestoneIndex].assignee,
            "Only assignee"
        );
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

    // ============ Project Creation ============

    /**
     * @notice Create new project with milestones and optional PM
     * @param pm Address of the project manager (can be address(0) for no PM)
     * @param pmFeeBps PM fee in basis points (0-2000, i.e., 0-20%)
     * @param descriptions Array of milestone descriptions
     * @param amounts Array of milestone amounts (in wei)
     * @param initialAssignees Optional array of initial assignees (can contain address(0))
     */
    function createProject(
        address pm,
        uint256 pmFeeBps,
        string[] memory descriptions,
        uint256[] memory amounts,
        address[] memory initialAssignees
    ) external payable returns (uint256) {
        require(descriptions.length == amounts.length, "Array length mismatch");
        require(descriptions.length > 0, "Need at least one milestone");
        require(descriptions.length <= 50, "Too many milestones");
        require(pmFeeBps <= MAX_PM_FEE_BPS, "PM fee too high");

        // Handle initialAssignees - can be empty or same length as descriptions
        require(
            initialAssignees.length == 0 || initialAssignees.length == descriptions.length,
            "Assignees array length mismatch"
        );

        // PM validation
        if (pm != address(0)) {
            require(pm != msg.sender, "Client cannot be PM");
        } else {
            require(pmFeeBps == 0, "Cannot set fee without PM");
        }

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] >= MIN_MILESTONE_AMOUNT, "Amount too small");
            require(bytes(descriptions[i]).length > 0, "Description required");
            require(bytes(descriptions[i]).length <= 500, "Description too long");

            // Validate assignee if provided
            if (initialAssignees.length > 0 && initialAssignees[i] != address(0)) {
                require(initialAssignees[i] != msg.sender, "Client cannot be assignee");
                require(initialAssignees[i] != pm, "PM cannot be assignee");
            }

            total += amounts[i];
        }
        require(msg.value == total, "Incorrect payment amount");

        uint256 projectId = projectCount++;
        Project storage project = projects[projectId];
        project.client = msg.sender;
        project.pm = pm;
        project.pmFeeBps = pmFeeBps;
        project.totalAmount = total;
        project.totalPaid = 0;
        project.totalPmFees = 0;
        project.active = true;

        for (uint256 i = 0; i < descriptions.length; i++) {
            address assignee = initialAssignees.length > 0 ? initialAssignees[i] : address(0);
            MilestoneStatus initialStatus = assignee != address(0)
                ? MilestoneStatus.Assigned
                : MilestoneStatus.Created;

            project.milestones.push(Milestone({
                description: descriptions[i],
                amount: amounts[i],
                assignee: assignee,
                createdAt: block.timestamp,
                assignedAt: assignee != address(0) ? block.timestamp : 0,
                acceptedAt: 0,
                submittedAt: 0,
                status: initialStatus,
                submissionNote: ""
            }));

            if (assignee != address(0)) {
                emit MilestoneAssigned(projectId, i, assignee, msg.sender);
            }
        }

        emit ProjectCreated(projectId, msg.sender, pm, pmFeeBps, total, descriptions.length);
        return projectId;
    }

    // ============ Assignment Functions ============

    /**
     * @notice Assign a worker to a milestone
     * @dev Can be called by client or PM. Worker must then accept.
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     * @param assignee Address of the worker to assign
     */
    function assignMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        address assignee
    )
        external
        onlyClientOrPM(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Project storage project = projects[projectId];
        Milestone storage milestone = project.milestones[milestoneIndex];

        require(milestone.status == MilestoneStatus.Created, "Milestone not in Created status");
        require(assignee != address(0), "Invalid assignee address");
        require(assignee != project.client, "Client cannot be assignee");
        require(assignee != project.pm, "PM cannot be assignee");

        milestone.assignee = assignee;
        milestone.assignedAt = block.timestamp;
        milestone.status = MilestoneStatus.Assigned;

        emit MilestoneAssigned(projectId, milestoneIndex, assignee, msg.sender);
    }

    /**
     * @notice Accept an assigned milestone
     * @dev Can only be called by the assignee
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function acceptMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        onlyAssignee(projectId, milestoneIndex)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Assigned, "Milestone not in Assigned status");

        milestone.acceptedAt = block.timestamp;
        milestone.status = MilestoneStatus.Accepted;

        emit MilestoneAccepted(projectId, milestoneIndex, msg.sender);
    }

    /**
     * @notice Decline an assigned milestone
     * @dev Can only be called by the assignee. Returns milestone to Created status.
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     * @param reason Reason for declining
     */
    function declineMilestone(uint256 projectId, uint256 milestoneIndex, string memory reason)
        external
        onlyAssignee(projectId, milestoneIndex)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Assigned, "Milestone not in Assigned status");

        address previousAssignee = milestone.assignee;

        milestone.assignee = address(0);
        milestone.assignedAt = 0;
        milestone.status = MilestoneStatus.Created;

        emit MilestoneDeclined(projectId, milestoneIndex, previousAssignee, reason);
    }

    /**
     * @notice Unassign a worker from a milestone
     * @dev Can be called by client or PM. Only works for Assigned status (before acceptance).
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function unassignMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        onlyClientOrPM(projectId)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Assigned, "Can only unassign from Assigned status");

        address previousAssignee = milestone.assignee;

        milestone.assignee = address(0);
        milestone.assignedAt = 0;
        milestone.status = MilestoneStatus.Created;

        emit MilestoneUnassigned(projectId, milestoneIndex, previousAssignee);
    }

    /**
     * @notice Auto-unassign if assignment timeout passed
     * @dev Anyone can call this to clean up stale assignments
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function expireAssignment(uint256 projectId, uint256 milestoneIndex)
        external
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Assigned, "Not in Assigned status");
        require(
            block.timestamp >= milestone.assignedAt + ASSIGNMENT_TIMEOUT,
            "Assignment not expired"
        );

        address previousAssignee = milestone.assignee;

        milestone.assignee = address(0);
        milestone.assignedAt = 0;
        milestone.status = MilestoneStatus.Created;

        emit MilestoneUnassigned(projectId, milestoneIndex, previousAssignee);
    }

    // ============ Work Functions ============

    /**
     * @notice Start working on a milestone
     * @dev Can only be called by assignee after accepting
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     */
    function startMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        onlyAssignee(projectId, milestoneIndex)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Accepted, "Milestone not in Accepted status");

        milestone.status = MilestoneStatus.InProgress;
        emit MilestoneStarted(projectId, milestoneIndex);
    }

    /**
     * @notice Submit completed work for review
     * @dev Can be called from Accepted or InProgress status
     * @param projectId The project ID
     * @param milestoneIndex Index of the milestone
     * @param note Submission note describing deliverables
     */
    function submitMilestone(uint256 projectId, uint256 milestoneIndex, string memory note)
        external
        onlyAssignee(projectId, milestoneIndex)
        projectActive(projectId)
        validMilestoneIndex(projectId, milestoneIndex)
    {
        Milestone storage milestone = projects[projectId].milestones[milestoneIndex];
        require(
            milestone.status == MilestoneStatus.Accepted ||
            milestone.status == MilestoneStatus.InProgress,
            "Cannot submit from current status"
        );

        milestone.status = MilestoneStatus.Submitted;
        milestone.submittedAt = block.timestamp;
        milestone.submissionNote = note;

        emit MilestoneSubmitted(projectId, milestoneIndex, note);
    }

    // ============ Approval Functions ============

    /**
     * @notice Approve a milestone and trigger payment
     * @dev Only client can approve. Pays assignee minus PM fee.
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
        uint256 assigneeAmount = milestone.amount - pmFee;

        // Update state before external calls
        milestone.status = MilestoneStatus.Paid;
        project.totalPaid += milestone.amount;
        project.totalPmFees += pmFee;

        // Transfer to assignee
        (bool s1,) = milestone.assignee.call{value: assigneeAmount}("");
        require(s1, "Assignee transfer failed");

        // Transfer to PM (if exists and fee > 0)
        if (project.pm != address(0) && pmFee > 0) {
            (bool s2,) = project.pm.call{value: pmFee}("");
            require(s2, "PM transfer failed");
        }

        emit MilestoneApproved(projectId, milestoneIndex, assigneeAmount, pmFee);
    }

    /**
     * @notice Reject a milestone submission
     * @dev Returns milestone to InProgress status for revision
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

    // ============ Release & Cancel Functions ============

    /**
     * @notice Release payment for approved milestone (legacy) or auto-release after timeout
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
        require(milestone.assignee != address(0), "No assignee");

        bool isApproved = milestone.status == MilestoneStatus.Approved;
        bool isSubmittedAndTimedOut =
            milestone.status == MilestoneStatus.Submitted &&
            milestone.submittedAt > 0 &&
            block.timestamp >= milestone.submittedAt + TIMEOUT_PERIOD;

        require(isApproved || isSubmittedAndTimedOut, "Not ready to release");

        // Calculate PM fee
        uint256 pmFee = (milestone.amount * project.pmFeeBps) / BPS_DENOMINATOR;
        uint256 assigneeAmount = milestone.amount - pmFee;

        // Update state before external calls
        milestone.status = MilestoneStatus.Paid;
        project.totalPaid += milestone.amount;
        project.totalPmFees += pmFee;

        // Transfer to assignee
        (bool s1,) = milestone.assignee.call{value: assigneeAmount}("");
        require(s1, "Transfer failed");

        // Transfer to PM (if exists and fee > 0)
        if (project.pm != address(0) && pmFee > 0) {
            (bool s2,) = project.pm.call{value: pmFee}("");
            require(s2, "PM transfer failed");
        }

        emit MilestonePaid(projectId, milestoneIndex, milestone.amount, isSubmittedAndTimedOut);
    }

    /**
     * @notice Cancel project and refund unpaid milestones
     * @dev Can only cancel if no milestones are submitted or in progress with work done
     * @param projectId The project ID
     */
    function cancelProject(uint256 projectId)
        external
        onlyClient(projectId)
        projectActive(projectId)
        nonReentrant
    {
        Project storage project = projects[projectId];

        uint256 refundAmount = 0;
        bool hasActiveWork = false;

        for (uint256 i = 0; i < project.milestones.length; i++) {
            MilestoneStatus status = project.milestones[i].status;
            // Cannot cancel if there's submitted work or approved work
            if (status == MilestoneStatus.Approved || status == MilestoneStatus.Submitted) {
                hasActiveWork = true;
                break;
            }
            if (status != MilestoneStatus.Paid) {
                refundAmount += project.milestones[i].amount;
            }
        }

        require(!hasActiveWork, "Cannot cancel with submitted or approved milestones");
        require(refundAmount > 0, "No funds to refund");

        project.active = false;
        for (uint256 i = 0; i < project.milestones.length; i++) {
            if (project.milestones[i].status != MilestoneStatus.Paid) {
                project.milestones[i].status = MilestoneStatus.Paid;
            }
        }

        (bool success, ) = project.client.call{value: refundAmount}("");
        require(success, "Refund failed");

        emit ProjectCancelled(projectId, refundAmount);
    }

    /**
     * @notice Emergency reclaim for stalled milestones
     * @dev Client can reclaim funds after extended timeout
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
            milestone.status != MilestoneStatus.Approved &&
            milestone.status != MilestoneStatus.Submitted,
            "Cannot reclaim approved or submitted milestone"
        );

        uint256 emergencyTimeout = milestone.createdAt + (TIMEOUT_PERIOD * 2);
        require(block.timestamp >= emergencyTimeout, "Emergency timeout not reached");

        milestone.status = MilestoneStatus.Paid;

        (bool success, ) = project.client.call{value: milestone.amount}("");
        require(success, "Emergency reclaim failed");

        emit MilestonePaid(projectId, milestoneIndex, milestone.amount, true);
    }

    // ============ View Functions ============

    /**
     * @notice Get project details
     */
    function getProject(uint256 projectId) external view returns (
        address client,
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
     * @notice Get milestone basic details
     */
    function getMilestone(uint256 projectId, uint256 milestoneIndex)
        external
        view
        validMilestoneIndex(projectId, milestoneIndex)
        returns (
            string memory description,
            uint256 amount,
            address assignee,
            MilestoneStatus status,
            uint256 createdAt,
            uint256 submittedAt,
            string memory submissionNote
        )
    {
        Milestone storage m = projects[projectId].milestones[milestoneIndex];
        return (m.description, m.amount, m.assignee, m.status, m.createdAt, m.submittedAt, m.submissionNote);
    }

    /**
     * @notice Get milestone timestamps
     */
    function getMilestoneTimestamps(uint256 projectId, uint256 milestoneIndex)
        external
        view
        validMilestoneIndex(projectId, milestoneIndex)
        returns (
            uint256 createdAt,
            uint256 assignedAt,
            uint256 acceptedAt,
            uint256 submittedAt,
            bool canAutoRelease
        )
    {
        Milestone storage m = projects[projectId].milestones[milestoneIndex];
        bool autoRelease = m.status == MilestoneStatus.Submitted &&
            m.submittedAt > 0 &&
            block.timestamp >= m.submittedAt + TIMEOUT_PERIOD;
        return (m.createdAt, m.assignedAt, m.acceptedAt, m.submittedAt, autoRelease);
    }

    /**
     * @notice Get all milestones for a project
     */
    function getAllMilestones(uint256 projectId) external view returns (
        string[] memory descriptions,
        uint256[] memory amounts,
        address[] memory assignees,
        MilestoneStatus[] memory statuses,
        uint256[] memory submittedAts,
        string[] memory submissionNotes
    ) {
        Project storage project = projects[projectId];
        uint256 length = project.milestones.length;

        descriptions = new string[](length);
        amounts = new uint256[](length);
        assignees = new address[](length);
        statuses = new MilestoneStatus[](length);
        submittedAts = new uint256[](length);
        submissionNotes = new string[](length);

        for (uint256 i = 0; i < length; i++) {
            Milestone storage milestone = project.milestones[i];
            descriptions[i] = milestone.description;
            amounts[i] = milestone.amount;
            assignees[i] = milestone.assignee;
            statuses[i] = milestone.status;
            submittedAts[i] = milestone.submittedAt;
            submissionNotes[i] = milestone.submissionNote;
        }

        return (descriptions, amounts, assignees, statuses, submittedAts, submissionNotes);
    }

    /**
     * @notice Get project statistics
     */
    function getProjectStats(uint256 projectId) external view returns (
        uint256 totalMilestones,
        uint256 completedMilestones,
        uint256 paidMilestones,
        uint256 remainingAmount,
        uint256 assignedMilestones,
        uint256 acceptedMilestones
    ) {
        Project storage project = projects[projectId];
        uint256 completed = 0;
        uint256 paid = 0;
        uint256 assigned = 0;
        uint256 accepted = 0;

        for (uint256 i = 0; i < project.milestones.length; i++) {
            MilestoneStatus status = project.milestones[i].status;

            if (status == MilestoneStatus.Assigned) {
                assigned++;
            }
            if (status == MilestoneStatus.Accepted ||
                status == MilestoneStatus.InProgress ||
                status == MilestoneStatus.Submitted ||
                status == MilestoneStatus.Approved ||
                status == MilestoneStatus.Paid) {
                accepted++;
            }
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
            project.totalAmount - project.totalPaid,
            assigned,
            accepted
        );
    }

    /**
     * @notice Check if address is involved in a project
     */
    function getAddressRole(uint256 projectId, address addr) external view returns (
        bool isClient,
        bool isPM,
        uint256[] memory assignedMilestones
    ) {
        Project storage project = projects[projectId];

        isClient = project.client == addr;
        isPM = project.pm == addr;

        // Count how many milestones this address is assigned to
        uint256 count = 0;
        for (uint256 i = 0; i < project.milestones.length; i++) {
            if (project.milestones[i].assignee == addr) {
                count++;
            }
        }

        assignedMilestones = new uint256[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < project.milestones.length; i++) {
            if (project.milestones[i].assignee == addr) {
                assignedMilestones[j++] = i;
            }
        }

        return (isClient, isPM, assignedMilestones);
    }
}
