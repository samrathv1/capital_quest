# CAPITAL QUEST — ROLE & PERMISSION MATRIX (RBAC & RACI)

**Document Reference:** `CQ-SPEC-05`  
**Status:** Implementation-Ready Specification  
**Version:** 1.0.0-PROPOSED  

---

## 1. Security Architecture & Threat Model

The Capital Quest operational environment involves high-stakes college competition, tight time constraints, and multi-user concurrent access across laptops and mobile devices.

### 1.1 Core Security Mandates
1. **Zero Service-Role Leaks:** The Supabase `service_role` secret key is strictly restricted to server-side Node.js environments (Next.js Server Actions / API routes). It is **never** bundled into client-side code, environment variables prefixed with `NEXT_PUBLIC_`, or browser local storage.
2. **Defense-in-Depth:** Authorization is validated at two independent boundaries:
   - **Application Layer:** Next.js middleware and Server Action guards check session claims before initiating business logic.
   - **Database Layer:** Supabase PostgreSQL Row-Level Security (RLS) guarantees that direct Supabase queries cannot bypass security constraints.
3. **No RLS Disabling:** Under no circumstances is `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` permitted in production or staging.
4. **Strict Audit Trail:** Every privileged operation (locking a round, entering a decision, modifying an entry, running simulation, rolling back) logs actor ID, timestamp, and before/after payloads.

---

## 2. System Personas & Capabilities

| Role Code | Role Name | Description & Trust Profile | Primary Devices |
|:---|:---|:---|:---|
| `super_admin` | **Super Admin (Lead Organizer)** | Supreme tournament administrator. Holds full authority over event parameters, rounds, simulations, and rollbacks. | Organizer Laptops |
| `domain_coordinator` | **Domain Coordinator (Room Lead)** | Floor manager assigned to supervise one of the 4 domains. Flags missing slips, approves overrides for their domain. | Staff Laptops / Tablets |
| `volunteer` | **Volunteer Data Operator** | Event staff member dedicated to rapid 10-key digitization of paper decision slips and peer verification. | Volunteer Laptops with NumPad |
| `judge` | **Judge / Independent Auditor** | Faculty member, sponsor, or VC adjudicator. Has read-only audit access to financial ledgers, formulas, and dry runs. | Judge Tablets / Laptops |
| `public_observer` | **Participant / Arena Observer** | Competing student teams, spectators, and AV presentation screens. Read-only access to published tournament state. | Smartphones / Projector Displays |

---

## 3. Comprehensive RBAC Matrix by Entity & Action

The following matrix defines permitted actions (`C` = Create, `R` = Read, `U` = Update, `D` = Delete):

| Entity / Resource | Super Admin | Domain Coordinator | Volunteer | Judge / Auditor | Public / Team |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Events Configuration** | `C R U D` | `R` | `R` (Active only) | `R` | `R` (Public metadata) |
| **Business Domains** | `C R U D` | `R` | `R` | `R` | `R` |
| **Team Rosters & Codes** | `C R U D` | `R U` (Assigned) | `R` (Codes only) | `R` | `R` (Company names) |
| **Round State (`DRAFT`/`OPEN`/`LOCKED`)** | `C R U D` | `R` | `R` | `R` | `R` (Current state) |
| **Decisions (Round is `OPEN`)** | `C R U D` | `C R U` (Assigned) | `C R U` (Data Entry) | `R` | `None` (Paper-only) |
| **Decisions (Round is `LOCKED`)** | `C R U D` (Override) | `R` | `R` (Read-only) | `R` | `None` |
| **Market Events & Shocks** | `C R U D` | `R` | `R` | `R` | `R` (If pre-announced) |
| **Investment Offers Desk** | `C R U D` | `R` | `R` | `R` | `R` (Current active) |
| **Financial Ledger Entries** | `R` (System-gen) | `R` (Assigned) | `None` | `R` (Full Audit) | `R` (Published team) |
| **Cap Table & Equity Shares** | `R U` (System-gen) | `R` (Assigned) | `None` | `R` (Full Audit) | `R` (Published team) |
| **Simulation Trigger / Dry Run** | `EXECUTE` | `None` | `None` | `None` | `None` |
| **Simulation Rollback** | `EXECUTE` | `None` | `None` | `None` | `None` |
| **Provisional Snapshots (`SIMULATED`)** | `R U` (Review) | `R` (Assigned) | `None` | `R` (Audit review) | `None` (Embargoed) |
| **Official Snapshots (`PUBLISHED`)** | `R` | `R` | `R` | `R` | `R` (Public access) |
| **Arena Presentation Mode** | `CONTROL` | `R` | `R` | `R` | `VIEW` (Audience display) |
| **System Audit Logs** | `R` | `None` | `None` | `R` | `None` |

---

## 4. Lifecycle Permissions State Machine

Permissions dynamically contract and expand based on the **Lifecycle Status** of each round:

```
+----------------------------------------------------------------------------------------------------+
|                               ROUND LIFECYCLE PERMISSIONS BOUNDARIES                               |
+----------------------------------------------------------------------------------------------------+
| STATE: DRAFT                                                                                       |
|   - Super Admin: Full editing of round type, market events, investment offers.                     |
|   - Volunteers: Entry locked (Screen displays "Awaiting Round Opening").                           |
|   - Public: Hidden.                                                                                |
|                                                                                                    |
| STATE: OPEN                                                                                        |
|   - Volunteers: Full 10-key entry and peer verification enabled.                                   |
|   - Domain Coordinator: Can flag illegible slips or request team re-verifications.                |
|   - Super Admin: Monitors real-time submission progress bar (e.g., "34/40 Entered").               |
|                                                                                                    |
| STATE: LOCKED                                                                                      |
|   - Volunteers: Hard lock. Data entry inputs disabled. Edits blocked at DB level via RLS.         |
|   - Super Admin: Can perform emergency single-cell overrides with mandatory audit reason.          |
|   - Simulation: Enabled for Super Admin execution.                                                 |
|                                                                                                    |
| STATE: SIMULATED (Review Staging)                                                                  |
|   - Super Admin & Judges: Provisional dashboard unlocked. Dry-run metrics inspected.              |
|   - Public & Teams: Results remain completely embargoed (prevents premature leaks).               |
|                                                                                                    |
| STATE: PUBLISHED                                                                                   |
|   - Public, Arena Projector, and Teams: Full read access to official snapshots and leaderboard.    |
|   - Database: Snapshots marked immutable.                                                          |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. RACI Implementation Matrix

| Project Milestone / Activity | Super Admin | Domain Coordinator | Volunteer | Judge / Auditor | Teams |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Setup Event & Starting Balance ($1M / $200k)** | **Accountable** | Informed | Informed | Consulted | Informed |
| **Assign Teams to 4 Industry Domains** | **Accountable** | Consulted | Informed | Informed | Informed |
| **Distribute Paper Decision Slips** | Informed | **Accountable** | Responsible | Informed | Responsible |
| **Digitize Slips into System** | Accountable | Consulted | **Responsible** | Informed | None |
| **Peer-Verify Digitize Accuracy** | Accountable | Consulted | **Responsible** | Informed | None |
| **Authorize Missing Slip Default Policy** | **Accountable** | Responsible | Informed | Consulted | Informed |
| **Lock Round Submissions** | **Accountable** | Informed | Informed | Informed | Informed |
| **Execute Server Simulation** | **Accountable** | Informed | None | Informed | None |
| **Sanity-Check Provisional Ledger** | **Accountable** | Informed | None | **Consulted** | None |
| **Trigger Round Rollback (if error found)** | **Accountable** | Informed | None | Consulted | None |
| **Publish Official Results** | **Accountable** | Informed | Informed | Informed | Informed |
| **Project Arena Presentation Reveal** | **Accountable** | Responsible | Informed | Informed | Audience |

*(R = Responsible for execution, A = Accountable / Approver, C = Consulted for expertise, I = Informed)*

---

## 6. Access Control Enforcement Patterns

### 6.1 Server Action Guard Pattern (Next.js TypeScript)

```typescript
// server/guards/authGuards.ts
import { createServerClient } from '@/lib/supabase/server';
import { UserRole } from '@/types/database';

export async function requireRole(allowedRoles: UserRole[]) {
  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('UNAUTHENTICATED: Active session required.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active, assigned_domain_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    throw new Error('UNAUTHORIZED: Profile not found or account deactivated.');
  }

  if (!allowedRoles.includes(profile.role)) {
    throw new Error(`FORBIDDEN: Requires one of [${allowedRoles.join(', ')}]. Found: ${profile.role}`);
  }

  return { user, profile };
}

// Usage in Privileged Server Action:
export async function executeSimulationAction(roundId: string) {
  // Enforce Super Admin only
  const { user } = await requireRole(['super_admin']);
  
  // Proceed with deterministic simulation...
}
```

### 6.2 Frontend Component Security Masking

```tsx
// components/auth/RoleGate.tsx
import { ReactNode } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UserRole } from '@/types/database';

interface RoleGateProps {
  allowedRoles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { profile, isLoading } = useUserProfile();

  if (isLoading || !profile) return null;
  if (!allowedRoles.includes(profile.role)) return <>{fallback}</>;

  return <>{children}</>;
}
```
