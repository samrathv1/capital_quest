# CAPITAL QUEST — API & SERVER OPERATION DESIGN

**Document Reference:** `CQ-SPEC-08`  
**Status:** Implementation-Ready Specification  
**Architecture:** Next.js 15 App Router (Server Actions & Route Handlers) + Supabase Realtime  
**Version:** 1.0.0-PROPOSED  

---

## 1. API Architecture & Standards

All server endpoints in Capital Quest adhere to the following standards:
1. **Strong Typing & Runtime Validation:** Every incoming payload is validated using **Zod** schemas before reaching controller logic. Invalid payloads immediately return structured HTTP 422 errors.
2. **Standardized JSON Envelope:** All responses follow a uniform response envelope:
   ```typescript
   interface ApiResponse<T> {
     success: boolean;
     data?: T;
     error?: {
       code: string;
       message: string;
       details?: unknown;
     };
     meta?: {
       timestamp: string;
       requestId: string;
     };
   }
   ```
3. **Session Authentication:** Handlers verify Supabase Auth JWT cookies and enforce role restrictions via `requireRole()`.

---

## 2. Core API Endpoints Specification

---

### Endpoint 1: Rapid Decision Entry (Volunteer NumPad Submit)
- **Method / Route:** `POST /api/decisions/submit`
- **Access:** `volunteer`, `domain_coordinator`, `super_admin`
- **Zod Validation Schema:**
  ```typescript
  import { z } from 'zod';

  export const DecisionSubmitSchema = z.object({
    roundId: z.string().uuid(),
    teamId: z.string().uuid(),
    marketingBudget: z.number().min(0, "Marketing budget must be non-negative"),
    rdBudget: z.number().min(0, "R&D budget must be non-negative"),
    productionUnits: z.number().int().min(0, "Production units must be integer >= 0"),
    unitPrice: z.number().min(0, "Unit price must be non-negative"),
    operationsBudget: z.number().min(0, "Operations budget must be non-negative"),
    investmentDecision: z.enum(['none', 'offer_a', 'offer_b', 'reject_both']).default('none'),
  });
  ```
- **Business Logic:**
  1. Verifies that the target round has `status = 'open'`.
  2. Fetches team's current available liquid cash from previous snapshot / ledger.
  3. Calculates total planned cash outflow. If outflow exceeds available cash, rejects with code `OVERSPENT_BUDGET` detailing deficit.
  4. Upserts decision row with `status = 'entered'`, stamping `entered_by = auth.uid()` and `entered_at = now()`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "decisionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "teamCode": "CT-04",
      "status": "entered",
      "plannedOutflow": 691200.00,
      "remainingCashReserve": 195600.00
    }
  }
  ```

---

### Endpoint 2: Blind Dual-Key Verification
- **Method / Route:** `POST /api/decisions/verify`
- **Access:** `volunteer`, `domain_coordinator`, `super_admin`
- **Zod Validation Schema:** Identical to `DecisionSubmitSchema`.
- **Business Logic:**
  1. Fetches existing decision entered by Operator A.
  2. Compares all 6 numeric fields bit-for-bit against Operator B's input.
  3. If match: Updates status to `verified`, stamps `verified_by = auth.uid()` and `verified_at = now()`.
  4. If mismatch: Flags record as `flagged` and returns field-by-field diff for coordinator review.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "decisionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "status": "verified",
      "matchedFields": 6,
      "discrepancies": []
    }
  }
  ```

---

### Endpoint 3: Lock Round Submissions
- **Method / Route:** `POST /api/rounds/[roundId]/lock`
- **Access:** `super_admin` only
- **Business Logic:**
  1. Checks count of unsubmitted or unverified decisions.
  2. If unsubmitted slips exist, requires explicit `overrideMissing: true` flag to apply default conservative policy.
  3. Updates round status to `locked`, stamps `locked_at = now()`.
  4. Broadcasts round state change to all clients via Supabase Realtime channel `events:active`.

---

### Endpoint 4: Execute Batch Simulation
- **Method / Route:** `POST /api/rounds/[roundId]/simulate`
- **Access:** `super_admin` only
- **Query / Body Parameters:**
  ```typescript
  export const SimulateParamsSchema = z.object({
    isDryRun: z.boolean().default(false),
  });
  ```
- **Business Logic:**
  1. Validates round is in `locked` state.
  2. Obtains PostgreSQL advisory lock for concurrency defense.
  3. Calls internal simulation engine pipeline (`SimulationEngine.execute(roundId, isDryRun)`).
  4. Commits snapshots and ledger rows.
  5. Updates round status to `simulated`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "roundId": "8a32ef34-...",
      "status": "simulated",
      "executionDurationMs": 1142,
      "companiesSimulated": 36,
      "isDryRun": false,
      "inputHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  }
  ```

---

### Endpoint 5: Publish Official Round Results
- **Method / Route:** `POST /api/rounds/[roundId]/publish`
- **Access:** `super_admin` only
- **Business Logic:**
  1. Verifies round is in `simulated` or `reviewed` state.
  2. Updates round status to `published`, stamps `published_at = now()`.
  3. Increments active event `active_round_number`.
  4. Unlocks snapshot RLS policies for public leaderboard reading.
  5. Pushes event notification to WebSocket / SSE presentation channel.

---

### Endpoint 6: Round Simulation Void / Correction (Non-Destructive - F-02 Fix)
- **Method / Route:** `POST /api/rounds/[roundId]/void`
- **Access:** `super_admin` only
- **Zod Validation Schema:**
  ```typescript
  export const VoidRoundSchema = z.object({
    adminPasswordConfirm: z.string().min(8),
    reason: z.string().min(10, "A detailed audit reason is mandatory for round corrections"),
  });
  ```
- **Business Logic:**
  1. Re-authenticates admin credentials.
  2. Enforces Cascade Guard: verifies no subsequent round ($N+1$) is currently active or simulated.
  3. Calls PostgreSQL atomic function `fn_void_or_supersede_round(p_round_id, auth.uid(), reason)`.
  4. Deactivates company snapshots (`is_active = false`) and marks ledger/equity entries as voided (`is_voided = true`). NEVER deletes historical records.
  5. Restores round status to `locked` for administrative review and re-simulation.
  6. Logs comprehensive audit log entry with actor ID, timestamp, and reason.

---

### Endpoint 7: Live Leaderboard Query
- **Method / Route:** `GET /api/leaderboard?eventId=[id]&roundNumber=[num]&domainId=[id]`
- **Access:** `anon`, `authenticated` (Public)
- **Caching:** Cache-Control: `public, s-maxage=10, stale-while-revalidate=30`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "roundNumber": 3,
      "leaderboard": [
        {
          "rank": 1,
          "teamCode": "HT-02",
          "companyName": "OmniBio Instruments",
          "domainName": "HealthTech & BioDevices",
          "valuation": 4820000.00,
          "retainedEquityPct": 87.5000,
          "finalScore": 4217500.00,
          "movement": 2
        }
      ]
    }
  }
  ```

---

### Endpoint 8: Presentation Mode Real-Time Stream
- **Method / Route:** `GET /api/presentation/stream?eventId=[id]`
- **Protocol:** Server-Sent Events (SSE) / Supabase Realtime Channel
- **Event Types Emitted:**
  - `ROUND_OPENED`: Emits new round briefing and active countdown timer.
  - `ROUND_LOCKED`: Emits locked state.
  - `RESULTS_PUBLISHED`: Emits trigger to start the stage reveal podium animation.
  - `REVEAL_NEXT_RANK`: Emits stage reveal step for AV presenter control.

---

## 3. Standardized Error Handling Architecture

```typescript
// server/errors/AppError.ts
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ROUND_NOT_OPEN'
  | 'ROUND_NOT_LOCKED'
  | 'OVERSPENT_BUDGET'
  | 'INVALID_PRICE_RANGE'
  | 'MISSING_SUBMISSIONS'
  | 'SIMULATION_FAILED'
  | 'ROLLBACK_FAILED';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```
