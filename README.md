# 💧 Drip - Programmable Payment Streams on Celo

**Drip** is a programmable payment streaming and recurring subscription platform built on Celo, enabling real-time stablecoin payments with autonomous smart contract execution.

---

## 🎯 Mission Summary

**Our Mission:** To democratize programmable payments by enabling autonomous, transparent, and cost-effective payment streams and subscriptions on the Celo blockchain.

**Vision:** A world where creators, collectives, and service platforms can automate continuous payouts and usage-based billing without the friction, costs, and delays of traditional payment systems.

**Core Values:**
- **Autonomy** - Smart contracts execute payments automatically, eliminating manual intervention
- **Transparency** - All transactions are on-chain, providing full auditability and trust
- **Accessibility** - Low gas costs and mobile-first design make programmable payments available to everyone
- **Efficiency** - Real-time streaming and automated subscriptions save time and reduce operational overhead
- **Innovation** - Leveraging blockchain technology to solve real-world payment challenges

**Impact:** Drip empowers treasury managers to automate payment distribution, enables creators to receive real-time payments, and provides service platforms with programmable billing infrastructure—all while maintaining complete transparency and reducing costs compared to legacy systems.

---

## 🎯 Pitch Deck

### The Problem

**Creators, collectives, and service platforms struggle to automate continuous payouts or usage-based billing.**

- **Treasury managers waste hours** reconciling spreadsheets and processing manual bulk transfers
- **Contributors wait** for delayed manual payments, creating cash flow issues
- **Legacy payroll systems** are expensive across borders and lack transparency or programmable logic
- **No real-time payment streaming** - payments are batch-based, not continuous
- **Recurring subscriptions** require manual intervention and lack on-chain auditability

### The Solution: Drip

Drip offers **programmable, real-time payment streams** and **recurring subscriptions** for stablecoins on the Celo network.

**Treasury teams define per-second rates or subscription cadences once** - the smart contract enforces distribution autonomously. Recipients can withdraw accrued balances instantly with on-chain proofs and full auditability.

### ✨ Key Features

#### 💸 Real-Time Payment Streaming
- **Per-second rate calculation** - Define payment rates that accrue continuously
- **Instant withdrawals** - Recipients can withdraw accrued balances at any time
- **Autonomous execution** - Smart contracts handle distribution automatically
- **Full transparency** - All transactions are on-chain and auditable

#### 🔄 Recurring Subscriptions
- **Flexible cadences** - Daily, weekly, monthly, or custom intervals
- **Automatic execution** - Payments process without manual intervention
- **Easy management** - Create, modify, or cancel subscriptions anytime
- **Payment history** - Complete on-chain record of all transactions

#### 📊 Treasury Management
- **Multi-token support** - Manage cUSD, USDC, USDT, and CELO
- **Bulk operations** - Create multiple streams/subscriptions at once
- **Analytics dashboard** - Track total outflow, active payments, and spending
- **Export functionality** - CSV/JSON export for reconciliation
- **Budget controls** - Set spending limits and monitor treasury health

### 🚀 How It Works

1. **Create a Stream or Subscription**
   - Treasury manager connects wallet and selects recipients
   - Defines payment amount, duration (for streams), or cadence (for subscriptions)
   - Chooses stablecoin (cUSD, USDC, USDT)
   - Smart contract locks funds and begins distribution

2. **Autonomous Execution**
   - **Streams**: Balance accrues per second based on defined rate
   - **Subscriptions**: Payments execute automatically at specified intervals
   - All logic enforced by smart contracts - no manual intervention needed

3. **Recipient Withdrawal**
   - Recipients see real-time accrued balance
   - One-click withdrawal to their wallet
   - Instant settlement on Celo network

4. **Transparency & Auditability**
   - All transactions recorded on-chain
   - Complete payment history available
   - Export data for accounting and reconciliation

### 💼 Use Cases

- **Content Creators**: Stream payments to collaborators, editors, or team members
- **DAOs & Collectives**: Automate contributor payouts and recurring grants
- **Service Platforms**: Usage-based billing for API calls, compute, or storage
- **Payroll**: Automated salary payments with real-time streaming
- **Subscriptions**: Recurring payments for SaaS, memberships, or services
- **Treasury Management**: Efficient multi-recipient payment distribution

### 🛠 Technology Stack

- **Blockchain**: Celo (EVM-compatible, mobile-first)
- **Smart Contracts**: Solidity ^0.8.20 with OpenZeppelin
- **Frontend**: Next.js 14, TypeScript, React
- **Wallet Integration**: RainbowKit, wagmi, viem
- **UI Components**: shadcn/ui, Tailwind CSS
- **Development**: Hardhat, Turborepo, PNPM

### 📈 Why Celo?

- **Low gas costs** - Critical for frequent per-second operations
- **Stablecoin ecosystem** - Native support for cUSD, USDC, USDT
- **Mobile-first** - Aligns with global payment accessibility
- **EVM-compatible** - Familiar development experience
- **Fast transactions** - Sub-second finality for real-time payments

### 🎯 Project Status

Drip is currently in active development. See [MILESTONES.md](./MILESTONES.md) for detailed progress tracking.

**8 Milestones Planned:**
1. ✅ Project Foundation & Smart Contract Architecture
2. ⏳ Core Payment Streaming Contract
3. ⏳ Recurring Subscription Contract
4. ⏳ Frontend Foundation & Wallet Integration
5. ⏳ Payment Streaming User Interface
6. ⏳ Subscription Management Interface
7. ⏳ Treasury Management Dashboard
8. ⏳ Advanced Features, Security & Polish

---

## 🏗 Project Structure

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the development server:
   ```bash
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

This is a monorepo managed by Turborepo with the following structure:

- `apps/web` - Next.js frontend application with Drip UI
- `apps/contracts` - Hardhat smart contract development environment
  - `contracts/` - Solidity smart contracts (DripCore, SubscriptionManager)
  - `test/` - Contract test suite
  - `ignition/` - Deployment scripts

## Available Scripts

- `pnpm dev` - Start development servers
- `pnpm build` - Build all packages and apps
- `pnpm lint` - Lint all packages and apps
- `pnpm type-check` - Run TypeScript type checking

### Smart Contract Scripts

- `pnpm contracts:compile` - Compile smart contracts
- `pnpm contracts:test` - Run smart contract tests
- `pnpm contracts:deploy` - Deploy contracts to local network
- `pnpm contracts:deploy:alfajores` - Deploy to Celo Alfajores testnet
- `pnpm contracts:deploy:sepolia` - Deploy to Celo Sepolia testnet
- `pnpm contracts:deploy:celo` - Deploy to Celo mainnet

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Smart Contracts**: Hardhat with Viem
- **Monorepo**: Turborepo
- **Package Manager**: PNPM

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Celo Documentation](https://docs.celo.org/)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [RainbowKit Documentation](https://www.rainbowkit.com/)
- [wagmi Documentation](https://wagmi.sh/)

## 🤝 Contributing

Drip is an open-source project. Contributions are welcome! Please see our development guidelines and code of conduct.

## 📄 License

[Add your license here]

---

**Built with ❤️ on Celo**
