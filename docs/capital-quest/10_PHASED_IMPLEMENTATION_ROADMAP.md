# CAPITAL QUEST — PHASED IMPLEMENTATION ROADMAP

**Document Reference:** `CQ-SPEC-10`  
**Status:** Implementation-Ready Specification  
**Version:** 1.0.0-PROPOSED  

---

## 1. Roadmap Overview & Phased Architecture

To guarantee tournament readiness without high-risk "big bang" integration panics, Capital Quest is built using an **Engine-First, Incremental Delivery Model**. Each phase produces a self-contained, fully tested milestone that forms the bedrock for subsequent layers:

```
+----------------------------------------------------------------------------------------------------+
|                                    8-PHASE EXECUTION ROADMAP                                       |
+----------------------------------------------------------------------------------------------------+
| PHASE 0: Foundation, Specification Corrections & Scaffolding (TypeScript, Tailwind, Vitest, Types)  |
| PHASE 1: Core Mathematical Engine & Invariant Test Suite (Pure TypeScript, Zero UI, 100% Tests)    |
| PHASE 2: Supabase Schema, DDL Migrations, Versioned Void Procedures & RLS Security                 |
| PHASE 3: Volunteer Fast 10-Key Digitization Console & Dual-Key Verification                        |
| PHASE 4: Admin Round Lifecycle Engine & Simulation Orchestrator                                    |
| PHASE 5: Financial Dossiers, Company Statements & Tournament Leaderboard                           |
| PHASE 6: Presentation Mode, Stage Projector Animations & AV Reveal Controls                        |
| PHASE 7: Stress Testing, Multi-Operator Load Testing & Venue Dry-Run Rehearsal                      |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Phase-by-Phase Implementation Breakdown

---

### Phase 0: Foundation, Specification Corrections & Project Scaffolding (P-03 Fix)
- **Objective:** Establish a rock-solid, production-grade Next.js 15 App Router project foundation with strict TypeScript, Tailwind CSS, shadcn/ui foundation, shared domain types, Vitest smoke tests, and corrected specifications.
- **Key Deliverables:**
  - Standardized Next.js 15 project setup with strict `tsconfig.json`.
  - Core directory architecture: `src/engine/`, `src/types/`, `src/components/`, `tests/`.
  - Shared domain interfaces and type definitions (`types/engine.ts`, `types/database.ts`).
  - Vitest test configuration and smoke test suite.
  - Environment variable template (`.env.example`).
  - Formal documentation corrections for F-01 (Starting Valuation), F-02 (Non-destructive rollback), P-01 (Single marketing exponent), and P-02 (Emergency borrowing disabled).
- **Dependencies:** None.
- **Exit Criteria / DoD:** Project compiles cleanly (`tsc --noEmit`), lint passes without warnings, Vitest configuration smoke test passes, production build succeeds.

---

### Phase 1: Core Mathematical Engine & Invariant Test Suite
- **Objective:** Build and verify the pure deterministic economic simulation engine in TypeScript before touching UI or database components.
- **Key Deliverables:**
  - `src/engine/marketEngine.ts`: Luce's choice demand allocation, price elasticity, brand and R&D decay with single exponentiation.
  - `src/engine/accountingEngine.ts`: Income statement, balance sheet, inventory cost accounting, and cash flow reconciliation.
  - `src/engine/valuationEngine.ts`: Multi-factor enterprise valuation with explicit Round 0 cash contribution piecewise rule ($V_{\text{cash}, 0} \equiv \$0.00$).
  - `src/engine/capTableEngine.ts`: Compounding equity dilution and ownership tracking.
  - Vitest test suite covering all 5 core mathematical invariants with $100\%$ code coverage.
- **Dependencies:** Phase 0 (Shared Types & Vitest Scaffolding).
- **Exit Criteria / DoD:** All 5 invariants pass across $1,000$ randomized test iterations; zero floating-point drift; Round 0 valuation regression test passes ($200,000.00$ exact).

---

### Phase 2: Database Schema, Supabase Migrations & Security
- **Objective:** Provision the normalized PostgreSQL database, Row-Level Security policies, and atomic simulation functions.
- **Key Deliverables:**
  - Supabase database migrations for 14 normalized tables and 7 custom enums.
  - Complete RLS policy rules enforcing strict role isolation.
  - PostgreSQL stored function `fn_void_or_supersede_round` for auditable, non-destructive round corrections.
  - Database seed scripts provisioning default event, 4 domains, and 40 team profiles.
- **Dependencies:** Phase 0 & Phase 1 (type definitions & engine formulas).
- **Exit Criteria / DoD:** Migration applies cleanly to a fresh Supabase instance; RLS policies verified by automated database tests; non-destructive voiding tested.

---

### Phase 3: Volunteer Fast 10-Key Digitization Console
- **Objective:** Deliver an ultra-responsive, keyboard-first data entry console optimized for rapid volunteer paper slip transcription.
- **Key Deliverables:**
  - `/volunteer/entry`: 10-key numeric entry screen with auto-advancing focus.
  - Real-time client-side solvency validation (instant overspending alert).
  - Quick action hotkeys (`F8: Auto-Scale`, `F9: Flag Slip`, `Ctrl+Enter: Submit`).
  - Blind dual-key verification interface with side-by-side mismatch highlighting.
- **Dependencies:** Phase 2 (decisions table and RLS).
- **Exit Criteria / DoD:** Volunteer operators can enter and verify a slip in $< 18$ seconds without touching a mouse.

---

### Phase 4: Admin Round Lifecycle & Simulation Orchestrator
- **Objective:** Build the tournament command center allowing administrators to manage rounds, run simulations, and execute rollbacks.
- **Key Deliverables:**
  - `/admin/rounds`: Lifecycle state machine (`DRAFT` $\to$ `OPEN` $\to$ `LOCKED` $\to$ `SIMULATED` $\to$ `PUBLISHED`).
  - Server Action calling transaction-safe simulation engine with PostgreSQL advisory locks.
  - Provisional Results Review Dashboard for Super Admin and Judges before publication.
  - One-click atomic round rollback with mandatory audit justification.
- **Dependencies:** Phase 1 (engine) and Phase 2 (schema).
- **Exit Criteria / DoD:** Admin can lock a round, simulate 40 teams in $< 1.5$ seconds, inspect provisional metrics, and publish with zero data corruption.

---

### Phase 5: Financial Dossiers, Statements & Leaderboard
- **Objective:** Implement comprehensive financial reporting for teams and the live tournament rankings.
- **Key Deliverables:**
  - `/leaderboard`: Real-time public rankings with upward/downward movement indicators and tie-breaker logic.
  - `/teams/[teamCode]/dossier`: Full three-statement financial reports (Income Statement, Balance Sheet, Cash Flow) and Recharts visual analytics.
  - Excel and PDF export engine for physical bulletin board distribution.
- **Dependencies:** Phase 4 (published snapshots).
- **Exit Criteria / DoD:** Team dossiers render smoothly in $< 300\text{ ms}$; multi-sheet Excel export generates in $< 2$ seconds.

---

### Phase 6: Presentation Mode & Stage AV Controls
- **Objective:** Deliver the projector-optimized stage display for live tournament ceremonies and dramatic podium reveals.
- **Key Deliverables:**
  - `/presentation`: 16:9 ultra-dark display optimized for 1080p and 4K projectors.
  - Animated horizontal bar race showing domain market share movements round-over-round.
  - "The Suspense Countdown": Spacebar-triggered podium reveal counting down from Rank 10 to Rank 1 with celebratory particle animations.
- **Dependencies:** Phase 5 (leaderboard metrics).
- **Exit Criteria / DoD:** Runs at stable 60 FPS on external HDMI displays; zero layout tearing.

---

### Phase 7: Stress Testing, Venue Disaster Rehearsal & Dry-Run
- **Objective:** Rigorous rehearsal under simulated venue conditions (intermittent Wi-Fi, volunteer entry errors, emergency rollbacks).
- **Key Deliverables:**
  - Automated Playwright benchmark simulating 20 teams across 5 rounds.
  - Volunteer training session and 30-minute mock tournament with event staff.
  - Emergency Wi-Fi failure dry run (validating offline data entry buffer and recovery).
- **Dependencies:** Phases 1 through 6.
- **Exit Criteria / DoD:** Full tournament rehearsal completed end-to-end with zero unhandled exceptions and organizer sign-off.
