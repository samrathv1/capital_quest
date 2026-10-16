# CAPITAL QUEST — RISK REGISTER & OPEN DECISIONS

**Document Reference:** `CQ-SPEC-11`  
**Status:** Implementation-Ready Specification  
**Version:** 1.0.0-PROPOSED  

---

## 1. Comprehensive Tournament Risk Register

The following matrix identifies operational, financial, technical, and human factors that could threaten tournament execution, along with concrete engineering and procedural mitigations:

| Risk ID | Risk Description | Severity | Likelihood | Impact on Event | Engineering & Operational Mitigation |
|:---:|:---|:---:|:---:|:---|:---|
| **RSK-01** | **Volunteer Transcription Typos Under Time Pressure** | **High** | **High** | Incorrect inputs distort round simulation and alter rankings unfairly. | 1. Dual-operator blind verification mode.<br>2. Real-time client-side range and budget constraints.<br>3. Instant visual warning if budget exceeds available cash. |
| **RSK-02** | **"Cash Hoarding" Dominant Strategy Exploitation** | **High** | **Medium** | A team spends $0 across all rounds, avoids all risk, and wins purely on retained cash. | 1. Valuation formula separates Enterprise Value ($EV$) from cash.<br>2. Unspent cash is discounted ($\omega_{\text{cash}} = 0.25$).<br>3. Productive R&D and revenue generate $4\times\text{ to }10\times$ higher valuation than unspent cash. |
| **RSK-03** | **Venue Wi-Fi Failure / Network Congestion** | **Critical** | **High** | Volunteers cannot submit slips; admin cannot run simulation; event stalls. | 1. Local volunteer client caching with automatic retry buffer.<br>2. Dedicated mobile hotspot backup for admin control laptop.<br>3. Self-contained local Docker / SQLite fallback engine available on admin machine. |
| **RSK-04** | **Student Team Refusal / Delay in Paper Slip Handover** | **Medium** | **High** | Round schedule delayed waiting for late teams. | 1. Hard timer cutoff enforced by Domain Coordinators.<br>2. "Default Conservative Policy" automatically applied to missing slips at cutoff. |
| **RSK-05** | **Severe In-Round Insolvency (Negative Cash)** | **High** | **Low** | Unexpected holding costs or demand collapse push liquid cash below zero. | 1. Automatic Emergency Liquidity Facility restores cash to $\$0$.<br>2. Punitive $25\%$ round interest penalty and $15\%$ enterprise valuation distress haircut applied. |
| **RSK-06** | **Student Misunderstanding of VC Equity Dilution** | **Medium** | **Medium** | Teams panic when seeing equity drop from $100\%$ to $60\%$, suspecting a system error. | 1. Clear explanation printed on physical investment offer slips showing pre/post money math.<br>2. Educational slide displayed on presentation screen during Round 2. |
| **RSK-07** | **Post-Publication Calculation Dispute by a Team** | **High** | **Low** | A team challenges results after official publication, threatening event credibility. | 1. Full audit trail showing exact volunteer who entered slip and timestamp.<br>2. Physical paper slip archived in domain bin with team signature for physical cross-examination.<br>3. Emergency atomic rollback tool available if legitimate clerical error is proven. |

---

## 2. Requirements & Decisions Classification Matrix

To maintain rigorous transparency, all architectural elements are classified into one of three categories:
- **CONFIRMED:** Explicitly mandated by the tournament baseline requirements. Immutable.
- **PROPOSED:** Architecturally designed solutions adhering to best practices, ready for implementation upon sign-off.
- **NEEDS APPROVAL:** Open strategic or organizational decisions requiring explicit organizer sign-off.

---

### Category A: CONFIRMED Baseline Requirements
These items are established by the event brief and are non-negotiable:
1. Every team begins with exactly **$\$1,000,000$** in virtual operating capital.
2. Every company has an initial game-defined valuation of **$\$200,000$**.
3. Companies compete within assigned business domains.
4. Teams allocate resources to marketing, R&D, inventory, and operations.
5. Remaining cash is retained as reserves.
6. Teams make decisions across multiple rounds.
7. Shared market conditions and competition influence outcomes.
8. Investment rounds provide two offers, with the option to reject both.
9. Investments provide capital in exchange for company ownership.
10. Results are calculated at the end of each round.
11. Final score = **Final Company Valuation $\times$ Team Ownership Retained**.
12. Volunteers enter decisions into the system.
13. Admins control round execution and results publication.

---

### Category B: PROPOSED Architectural Decisions
These items represent our technical and mathematical engineering design:
1. **Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS, shadcn/ui, Supabase PostgreSQL, Vitest, Playwright.
2. **Topology:** 4 Industry Domains (CleanTech, HealthTech, Enterprise SaaS, D2C Consumer Goods); 5 Simulation Rounds; 2 Investment Windows (Round 2 and Round 4).
3. **Paper-to-Digital Flow:** High-speed 10-key numeric entry interface with NumPad hotkeys and optional blind dual-key verification.
4. **Financial Decoupling:** Decoupling cash flow from accounting profit; inventory manufacturing costs paid immediately in cash upon production; COGS recognized only upon sale.
5. **Multi-Factor Valuation Engine:** Base Enterprise Value ($EV_0 = \$200,000$) + Trailing Revenue Multiple + EBITDA Multiple + Capitalized R&D Asset + Market Share Premium + Calibrated Cash Contribution ($\omega_{\text{cash}} = 0.25$).
6. **Compounding Dilution:** Mathematically exact multiplicative dilution maintaining $\sum \text{Equity} = 100.0000\%$.
7. **Database Concurrency & Forensic Integrity (F-02 Fix):** PostgreSQL transaction-level advisory locks preventing concurrent simulation runs; SHA-256 idempotency hashing; non-destructive versioned correction function `fn_void_or_supersede_round` preserving all published financial records.
8. **Insolvency Protection (P-02 Fix):** Emergency liquidity borrowing is disabled in MVP; allocations exceeding cash are rejected at data entry time.

---

### Category C: ORGANIZER POLICY GATES & DECISIONS REQUIRING APPROVAL

The following 6 operational policies are established as **PROPOSED TOURNAMENT DEFAULTS**. They represent the recommended engineering baseline, but must be formally ratified by the tournament organizers before competitive live deployment:

#### Policy Gate 1: Missing & Late Submissions Policy
- **Proposed Default:** A strict **3-minute grace period** after timer expiration. If a team still fails to submit an eligible, legible, and non-overspending slip, the **Conservative Survival Fallback** is applied automatically:
  - Price set to Domain Benchmark ($P_{\text{bench}}$).
  - Production clamped to minimum baseline units affordable with remaining cash.
  - Discretionary Marketing, R&D, and Operations budgets set to $\$0.00$.
  - Unexercised investment choices default to `REJECT_BOTH`.
  - Administrative delay penalty of $\$10,000$ deducted from cash reserves.
- **Alternative Considered:** Immediate round disqualification ($0 revenue, $0 production).
- **Status:** **PROPOSED DEFAULT — AWAITING FORMAL SIGN-OFF**.

#### Policy Gate 2: Market Event Disclosure Timing
- **Proposed Default:** **Hybrid Model** — 4 industry events are pre-announced on physical round briefing sheets (simulating strategic foresight), while 1 event (Round 3 Supply Chain Shock) occurs as an unexpected Black Swan disclosed after paper slip collection (simulating real-world crisis response).
- **Alternatives Considered:** 100% pre-announced (predictable) vs. 100% surprise shocks (chaotic).
- **Status:** **PROPOSED DEFAULT — AWAITING FORMAL SIGN-OFF**.

#### Policy Gate 3: Standardized Investment Offers
- **Proposed Default:** **Standardized Domain Offers** — All teams competing within a given domain receive the exact same Offer A and Offer B during Round 2 (Seed) and Round 4 (Series A), ensuring absolute comparative fairness and equal opportunity.
- **Alternative Considered:** Performance-dynamic offers based on trailing revenue multiples.
- **Status:** **PROPOSED DEFAULT — AWAITING FORMAL SIGN-OFF**.

#### Policy Gate 4: Participant Access Mode During Event
- **Proposed Default:** **Paper-Only Deliberation & Public Arena Presentation** — Competing student teams deliberate face-to-face using physical dossier handouts and track tournament progress via the arena stage display. Personal student laptop/mobile login is disabled to prevent venue Wi-Fi contention and eliminate digital cheating.
- **Alternative Considered:** QR-code mobile read-only portal for student phones.
- **Status:** **PROPOSED DEFAULT — AWAITING FORMAL SIGN-OFF**.

#### Policy Gate 5: Emergency Borrowing & Insolvency Policy
- **Proposed Default:** **No Emergency Borrowing in MVP** — Automatic emergency credit facilities, phantom distress loans, and arbitrary interest penalties are disabled. Overspending slips are rejected during digitization. Ending cash is strictly protected $\ge \$0.00$.
- **Alternative Considered:** Automated 25% interest distress credit facility.
- **Status:** **PROPOSED DEFAULT — AWAITING FORMAL SIGN-OFF**.

#### Policy Gate 6: Simulation Corrections & Audit Preservation
- **Proposed Default:** **Versioned Non-Destructive Corrections** — Historical financial ledger transactions, company snapshots, and equity movements are never hard-deleted. Corrections deactivate past simulation runs (`is_active = false`) and mark ledger entries voided (`is_voided = true`), accompanied by a mandatory audit reason. Reversing Round $N$ is strictly blocked if Round $N+1$ is already active.
- **Alternative Considered:** Hard-delete rollback (`fn_rollback_round`).
- **Status:** **PROPOSED DEFAULT — AWAITING FORMAL SIGN-OFF**.
