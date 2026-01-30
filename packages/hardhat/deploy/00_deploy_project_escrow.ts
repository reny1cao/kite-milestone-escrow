import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the "ProjectEscrow" contract
 *
 * ProjectEscrow is the enhanced version with:
 * - Per-milestone assignee (different workers per task)
 * - Explicit accept/decline workflow
 * - AI-compatible assignment design
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployProjectEscrow: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("ProjectEscrow", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const projectEscrow = await hre.ethers.getContract<Contract>("ProjectEscrow", deployer);
  console.log("✅ ProjectEscrow deployed!");
  console.log("📋 Project count:", await projectEscrow.projectCount());
  console.log("⏰ Timeout period:", await projectEscrow.TIMEOUT_PERIOD(), "seconds (14 days)");
  console.log("⏳ Assignment timeout:", await projectEscrow.ASSIGNMENT_TIMEOUT(), "seconds (7 days)");
};

export default deployProjectEscrow;

deployProjectEscrow.tags = ["ProjectEscrow"];
