<p align="center">
  <img src="./assets/kite-logo.svg" alt="Kite" width="96" height="96" />
</p>

<h1 align="center">Kite Milestone Escrow</h1>

A blockchain dApp for milestone-based project payments with on-chain escrow. Clients fund work upfront, workers get paid only when milestones are approved, and an optional project manager can route assignments and earn a commission.

Built on [Scaffold-ETH 2](https://docs.scaffoldeth.io) and deployed to the **Kite AI Testnet** (chain ID `2368`, native currency `KITE`).

## Why

Freelance and contract work on-chain typically falls back to a single lump payment or a trust-based handshake. This project splits a job into **milestones**, escrows funds per milestone, and lets a different worker be assigned to each one — making it usable for human teams and AI-agent workflows alike.

## Features

- **Per-milestone assignment** — every milestone can have its own assignee, so projects can mix workers (or AI agents) per task.
- **Explicit acceptance flow** — assigned workers must accept before work begins; unaccepted assignments auto-expire after 7 days.
- **Optional Project Manager** — a PM can route assignments and earn a configurable commission (0–20%, in basis points).
- **Auto-release on timeout** — submitted work auto-approves after 14 days if the client doesn't respond, protecting workers from silent ghosting.
- **Reentrancy-safe payouts** — uses OpenZeppelin `ReentrancyGuard`; minimum milestone amount of `0.001 KITE`.
- **AI Milestone Splitter** — turn a plain-text project brief into a milestone breakdown with per-milestone acceptance criteria. Streams from Kimi (Moonshot CN) and respects an optional total budget.

### Milestone state machine

```
Created → Assigned → Accepted → InProgress → Submitted → Approved → Paid
                  ↘ Declined (returns to Created, clears assignee)
```

## Stack

- **Contracts**: Solidity `^0.8.20`, Hardhat, OpenZeppelin
- **Frontend**: Next.js 15 (App Router), RainbowKit, wagmi, viem, TailwindCSS + DaisyUI
- **Tooling**: Scaffold-ETH 2 hooks/components, TypeScript, Yarn workspaces

## Repo layout

```
packages/
  hardhat/           # ProjectEscrow.sol, tests, deploy scripts
    contracts/
    deploy/
    test/
  nextjs/            # Next.js frontend
    app/
      projects/      # List, create, and detail pages
      debug/         # Auto-generated contract debugger
    components/
      escrow/        # ProjectCard, MilestoneCard, CreateProjectForm, ApprovalActions, ...
    scaffold.config.ts  # Target network configuration
```

## Requirements

- Node `>= 20.18.3`
- Yarn (v1 or v2+)
- Git

## Quickstart

```bash
# 1. Install dependencies
yarn install

# 2. Run a local Hardhat network (terminal 1)
yarn chain

# 3. Deploy contracts (terminal 2) — also regenerates TypeScript ABIs for the frontend
yarn deploy

# 4. Start the Next.js app (terminal 3)
yarn start
```

App runs at `http://localhost:3000`. The contract debugger lives at `/debug`.

## Network

The frontend currently targets the **Kite AI Testnet**:

| Field | Value |
| --- | --- |
| Chain ID | `2368` |
| Native currency | `KITE` |
| RPC | `https://rpc-testnet.gokite.ai/` |
| Explorer | `https://testnet.kitescan.ai` |

To target a different network, edit `targetNetworks` in `packages/nextjs/scaffold.config.ts`.

## Environment variables

Create `packages/nextjs/.env.local`:

```
NEXT_PUBLIC_ALCHEMY_API_KEY=...
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...

# Required for the AI Milestone Splitter (Kimi / Moonshot CN)
KIMI_API_KEY=...
# Optional:
# KIMI_BASE_URL=https://api.moonshot.cn/v1
# KIMI_MODEL=moonshot-v1-8k
```

For deployments (in `packages/hardhat/.env`):

```
DEPLOYER_PRIVATE_KEY_ENCRYPTED=...
```

Generate or import a deployer key with `yarn account:generate` / `yarn account:import`.

### Using Infisical (recommended)

`KIMI_API_KEY` lives in our shared Infisical workspace. The repo ships an `.infisical.json` mapping the workspace + default env, so you can inject secrets at runtime instead of pasting them into `.env.local`:

```bash
infisical login          # one-time
yarn start:ai            # runs `infisical run --env=dev --recursive -- yarn workspace @se-2/nextjs dev`
```

The secret never touches disk in this flow.

## Common commands

```bash
# Development
yarn chain                # Start local Hardhat node
yarn deploy               # Compile, deploy, regenerate TypeScript ABIs
yarn start                # Next.js dev server (reads .env.local)
yarn start:ai             # Same, but injects secrets from Infisical (Kimi key, etc.)

# Testing & types
yarn hardhat:test         # Solidity tests with gas reporting
yarn next:check-types     # TypeScript check for the frontend

# Code quality
yarn lint
yarn format

# Deployment
yarn vercel               # Deploy frontend to Vercel
yarn hardhat:verify       # Verify contracts on the block explorer
```

## Working with the contract from the frontend

Always use the Scaffold-ETH 2 hooks rather than raw wagmi/viem — they're typed against the deployed ABIs and stay in sync with `yarn deploy`.

```ts
// Reading
const { data } = useScaffoldReadContract({
  contractName: "ProjectEscrow",
  functionName: "getProject",
  args: [projectId],
});

// Writing
const { writeContractAsync } = useScaffoldWriteContract({ contractName: "ProjectEscrow" });
await writeContractAsync({
  functionName: "approveMilestone",
  args: [projectId, milestoneIndex],
});

// Events
const { data: events } = useScaffoldEventHistory({
  contractName: "ProjectEscrow",
  eventName: "MilestoneApproved",
  watch: true,
});
```

For displaying on-chain data, prefer the SE-2 components: `<Address />`, `<AddressInput />`, `<Balance />`, `<EtherInput />`.

## Contract constants

| Constant | Value | Purpose |
| --- | --- | --- |
| `TIMEOUT_PERIOD` | 14 days | Auto-release window after submission |
| `ASSIGNMENT_TIMEOUT` | 7 days | Auto-expire unaccepted assignments |
| `MIN_MILESTONE_AMOUNT` | 0.001 ether | Minimum funded amount per milestone |
| `MAX_PM_FEE_BPS` | 2000 | Maximum PM commission (20%) |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Smart-contract changes should ship with tests in `packages/hardhat/test/` and a passing `yarn hardhat:test` + `yarn next:check-types`.

## License

MIT — see [LICENCE](./LICENCE).
