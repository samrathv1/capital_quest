# CAPITAL QUEST — MASTER SPECIFICATION & ARCHITECTURE DOSSIER

**Project:** Capital Quest — Centralized Business Simulation Platform  
**Target Event:** College Entrepreneurship Competition & Summit  
**System Architecture:** Greenfield Specification (Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase PostgreSQL, Vitest, Playwright)  
**Status:** Implementation-Ready Specification (Planning Phase Complete — Awaiting Approval)  
**Specification Version:** 1.0.0-PROPOSED  
**Date:** October 2026  

---

## 1. Executive Summary

**Capital Quest** is a centralized, round-based business simulation platform designed to power competitive entrepreneurship tournaments. Over the course of **5 intense operating rounds** and **2 strategic investment windows**, 20 to 40 student-led virtual enterprises compete across **4 diverse industry domains**. 

Unlike decentralized simulations where participants log into individual accounts and execute decisions asynchronously, Capital Quest implements a high-integrity, **centralized "paper-to-digital" operational architecture**:
1. Participant teams deliberate face-to-face and submit decisions on standardized **physical paper decision sheets**.
2. Event volunteers stationed at data desks perform rapid, double-verified 10-key numeric entry.
3. Competition administrators govern the round lifecycle (Draft $\to$ Open $\to$ Locked $\to$ Simulated $\to$ Published), executing server-side deterministic economic models that compute market share, inventory fulfillment, revenue, unit economics, cash reconciliation, cap table dilution, and company valuation.
4. The event concludes with dynamic stage reveals via an immersive **Presentation Mode** displaying domain movements, company financial dossiers, and the ultimate equity-adjusted leaderboard.

---

## 2. Specification Document Map

This specification is partitioned into 11 modular, comprehensive technical documents located in `/docs/capital-quest/`:

| Doc # | Title | Primary Focus & Scope |
|:---:|:---|:---|
| **[01](file:///c:/Simulator_Upstart/docs/capital-quest/01_PRD_PRODUCT_REQUIREMENTS_DOCUMENT.md)** | **Product Requirements Document (PRD)** | Complete functional scope, personas, module specs, acceptance criteria, and MVP boundaries. |
| **[02](file:///c:/Simulator_Upstart/docs/capital-quest/02_BUSINESS_RULES_AND_GAME_MECHANICS.md)** | **Business Rules & Game Mechanics** | Domain archetypes, decision parameters, turn progression, market shock mechanisms, and constraints. |
| **[03](file:///c:/Simulator_Upstart/docs/capital-quest/03_FINANCIAL_FORMULA_SPECIFICATION.md)** | **Financial Formula Specification** | Mathematical engine: R&D, brand equity, Luce's choice demand, inventory, cash flow, valuation, and dilution. |
| **[04](file:///c:/Simulator_Upstart/docs/capital-quest/04_DATABASE_SCHEMA_DESIGN.md)** | **Database Schema Design** | Normalized Supabase PostgreSQL DDL, types, RLS policies, indexing, and transactional simulation function. |
| **[05](file:///c:/Simulator_Upstart/docs/capital-quest/05_ROLE_AND_PERMISSION_MATRIX.md)** | **Role & Permission Matrix** | RBAC enforcement across Super Admin, Domain Coordinator, Volunteer, Judge, and Public views. |
| **[06](file:///c:/Simulator_Upstart/docs/capital-quest/06_SCREEN_AND_NAVIGATION_SPECIFICATION.md)** | **Screen & Navigation Specification** | UI/UX blueprints, wireframe states, 10-key volunteer workflows, and projector-optimized presentation mode. |
| **[07](file:///c:/Simulator_Upstart/docs/capital-quest/07_SIMULATION_PROCESSING_ARCHITECTURE.md)** | **Simulation Processing Architecture** | Deterministic batch simulation engine, advisory locks, idempotency hashing, and zero-leak rollback. |
| **[08](file:///c:/Simulator_Upstart/docs/capital-quest/08_API_AND_SERVER_OPERATION_DESIGN.md)** | **API & Server Operation Design** | Server Actions, Zod validation schemas, RPC endpoints, real-time channels, and error standards. |
| **[09](file:///c:/Simulator_Upstart/docs/capital-quest/09_TESTING_AND_VERIFICATION_PLAN.md)** | **Testing & Verification Plan** | Automated mathematical invariants, Vitest unit suites, Playwright E2E flows, and 20-team mock simulation. |
| **[10](file:///c:/Simulator_Upstart/docs/capital-quest/10_PHASED_IMPLEMENTATION_ROADMAP.md)** | **Phased Implementation Roadmap** | Chronological 8-phase execution plan from foundation setup to venue rehearsals and dry runs. |
| **[11](file:///c:/Simulator_Upstart/docs/capital-quest/11_RISK_REGISTER_AND_OPEN_DECISIONS.md)** | **Risk Register & Open Decisions** | Formal risk mitigations, edge case playbooks, and Confirmed / Proposed / Needs Approval matrix. |

---

## 3. Core Architectural Tenets

1. **Strict Mathematical Determinism:** Given an identical set of initial states, round decisions, and seed configuration, the simulation engine will produce bit-for-bit identical results on every execution. Company evaluation order has zero influence on competitive outcomes.
2. **Absolute Financial Integrity (No Phantom Capital):** Operating cash flows, capital expenditures, inventory working capital, and investor financing are tracked with double-entry rigor. Cash flow is strictly decoupled from accounting net profit.
3. **High-Velocity Volunteer Ergonomics:** Volunteers operate under strict time limits (10–15 minutes between rounds). The UI provides keyboard-first 10-key numeric entry, inline real-time constraint validation, and dual-operator verification.
4. **Resilience to Venue Realities:** Designed for imperfect college Wi-Fi environments. All simulation processing resides in atomic database transactions on the server. Frontend states maintain optimistic entry buffers with automatic retry and local caching.
5. **Auditable & Non-Destructive Corrections:** Every volunteer key-press, administrator lock, simulation execution, and manual override is permanently logged with before/after state diffs. Round corrections utilize versioned simulation runs and soft-voiding, ensuring published financial records are never silently erased.
