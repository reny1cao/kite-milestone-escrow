import { ethers } from "hardhat";

async function main() {
  const escrow = await ethers.getContractAt(
    "MilestoneEscrow",
    "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  );

  console.log("\n=== Contract State ===");
  const count = await escrow.projectCount();
  console.log("Project Count:", count.toString());

  for (let i = 0; i < count; i++) {
    console.log(`\n=== Project ${i} ===`);
    const project = await escrow.getProject(i);
    console.log("Client:", project[0]);
    console.log("Freelancer:", project[1]);
    console.log("PM:", project[2]);
    console.log("PM Fee (bps):", project[3].toString());
    console.log("Total Amount:", ethers.formatEther(project[4]), "ETH");
    console.log("Total Paid:", ethers.formatEther(project[5]), "ETH");
    console.log("Total PM Fees:", ethers.formatEther(project[6]), "ETH");
    console.log("Active:", project[7]);
    console.log("Milestone Count:", project[8].toString());

    const milestones = await escrow.getAllMilestones(i);
    console.log("\nMilestones:");
    const statusNames = ["Created", "InProgress", "Submitted", "Approved", "Paid"];
    for (let j = 0; j < milestones[0].length; j++) {
      const statusIdx = Number(milestones[2][j]);
      console.log(
        `  [${j}] "${milestones[0][j]}" - ${ethers.formatEther(milestones[1][j])} ETH - Status: ${statusNames[statusIdx]} (${statusIdx})`
      );
      if (milestones[4][j]) {
        console.log(`      Submission Note: "${milestones[4][j]}"`);
      }
    }

    const stats = await escrow.getProjectStats(i);
    console.log("\nStats:");
    console.log("  Total Milestones:", stats[0].toString());
    console.log("  Completed:", stats[1].toString());
    console.log("  Paid:", stats[2].toString());
    console.log("  Remaining:", ethers.formatEther(stats[3]), "ETH");
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
