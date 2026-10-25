# Capital Quest — Event Operations & Staff Runbook

## 1. Initial Organizer Setup & Pre-Flight Checklist

### Hardware & Environment Requirements
1. **Primary Control Station (Super Admin):** High-reliability laptop with dedicated Ethernet or secure private Wi-Fi.
2. **Projector Workstation (Presentation Display):** Dedicated display machine connected via HDMI to the auditorium projector (1080p or 4K supported). Set browser to fullscreen (`F11`).
3. **Volunteer Digitization Terminals (x4 to x8):** Laptops or tablets with numeric keypads for high-speed volunteer decision entry and dual-entry verification.
4. **Local Network / Hotspot Backup:** 4G/5G mobile hotspot on standby in case of venue network drop.

### Supabase & Environment Verification
- Confirm target Supabase URL and anonymous keys in `.env.local`:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  ```
- Ensure migrations are fully deployed:
  ```bash
  npx supabase migration list
  ```
  *(Verify `20261021000000`, `20261021000001`, `20261024000000`, and `20261025000000_winner_embargo_rls` are applied).*

---

## 2. Staff Account Provisioning

Staff accounts are provisioned in Supabase Auth and mapped to `user_profiles` with authoritative roles:
- `super_admin`: Full administrative control, round lifecycle, simulation, voiding, podium release.
- `domain_coordinator`: Domain-specific monitoring, submission tracking, missing sheet alerts.
- `volunteer`: 10-key rapid paper digitizer and blind verification operator.
- `judge`: Read-only financial ledger, audit trail, and presentation review.

Run the provisioning script or execute SQL in the Supabase SQL editor:
```sql
-- Example: Assigning super admin role
UPDATE public.user_profiles
SET role = 'super_admin'
WHERE id = '<auth-user-uuid>';
```

---

## 3. Team & Company Registration

1. Navigate to `/admin/teams`.
2. Register the 40 competing companies (10 per domain):
   - **CleanTech & Hardware** (`CT-01` to `CT-10`)
   - **HealthTech & BioDevices** (`HT-01` to `HT-10`)
   - **Enterprise SaaS** (`ST-01` to `ST-10`)
   - **D2C Consumer Hardware** (`DT-01` to `DT-10`)
3. Assign physical table numbers (`Table 1A` to `Table 10D`).
4. Print physical decision slips labeled with team codes and round numbers.

---

## 4. Starting a Tournament

1. Navigate to `/admin/rounds`.
2. Verify Event status is `active`.
3. Open **Round 1**: Click **"Open Round for Submissions"**.
4. Confirm volunteer entry stations display Round 1 as active at `/volunteer/entry`.
5. Ensure the projector at `/presentation` displays the Welcome / Waiting screen.

---

## 5. Entering Paper Decision Slips (Operator A)

1. Volunteer Operator A sits at `/volunteer/entry`.
2. Select Team Code (e.g., `CT-01`).
3. Enter decisions using the 10-key numeric keypad:
   - Marketing Budget ($)
   - R&D Budget ($)
   - Operations Budget ($)
   - Production Units (Integer)
   - Unit Sale Price ($)
   - Investment Choice (`none`, `offer_a`, `offer_b`, `reject_both`)
4. Real-time budget validation alerts if total outflows exceed liquid cash.
5. Click **"Submit Decision"**. Status changes to `pending_verification`.

---

## 6. Blind Dual-Verification (Operator B)

1. Second Volunteer Operator B navigates to `/volunteer/verify`.
2. Select the same Team Code.
3. Operator B independently enters the values from the physical sheet without seeing Operator A's inputs.
4. Click **"Verify Decision"**:
   - **Match:** The decision is immediately marked `verified` and locked.
   - **Mismatch:** The system flags the discrepancy with an exact field-by-field diff. The Domain Coordinator or Super Admin inspects the physical slip and confirms the corrected value.

---

## 7. Simulating a Round

1. Check Readiness Dashboard at `/admin/readiness`:
   - Confirm all 40 companies have `verified` submissions.
2. Click **"Lock Round"** at `/admin/rounds` to prevent late submissions.
3. Review Organizer Policy Gates:
   - Cash Valuation Policy: Approved
   - Corporate Tax Rate: 20% flat
   - VC Offers Policy: Standard uniform
   - Strict Budget Hard Block: Enforced
4. Click **"Run Simulation"**:
   - The deterministic engine executes all 4 domains in < 250ms.
   - Snapshots, ledger entries, and equity logs are committed in a single atomic transaction.

---

## 8. Reviewing Financial Results

1. Navigate to `/admin/rounds/[roundId]/results`.
2. Inspect Financial Reconciliation:
   - Ending Cash = Prior Cash + Operating Cash Flow + Financing Cash Flow.
   - Tax expense matches 20% on positive EBT.
   - Cap tables conserve 100% total equity.
3. Super Admins and Judges review domain performance before releasing to audience.

---

## 9. Publishing Results & Public Leaderboard

1. Click **"Publish Round Results"** at `/admin/rounds`.
2. For Rounds 1 to 4:
   - Results immediately become visible on the public leaderboard (`/leaderboard`).
   - Teams can view detailed income statements, balance sheets, and cap tables at `/companies/[companyId]`.
3. **For Round 5 (Grand Finale):**
   - Marking Round 5 `published` enables the organizer podium ceremony.
   - **Winner Embargo Active:** Public leaderboard and company reports automatically hold Round 5 results in embargo until the podium reveal concludes. Anonymous users see Round 4 standings with an official embargo notice.

---

## 10. Operating the Projector & Ceremony Reveal

1. Open `/presentation` on the projector workstation in Fullscreen mode.
2. The Stage Presenter / Emcee opens `/admin/presentation` on a mobile device or tablet.
3. Select Presentation Mode:
   - **Standings:** Live multi-domain leaderboard.
   - **Domain Rankings:** Filtered view by domain (CleanTech, HealthTech, SaaS, D2C).
   - **Round Highlights:** Strategic spotlights (Top Scorers, Revenue Champions, Valuation Growth, Turnaround Climbers).
   - **Grand Ceremony (Final Round):**
     - Stage 1: **Waiting Screen** — All winners withheld.
     - Stage 2: **Reveal 3rd Place** — Bronze medalist spotlighted.
     - Stage 3: **Reveal 2nd Place** — Silver medalist spotlighted.
     - Stage 4: **Reveal 1st Place** — Grand Champion spotlighted.
     - Stage 5: **Official Podium** — Full podium released. Public embargo automatically lifted.

---

## 11. Handling Network Failures & Contingencies

1. **Presenter Disconnect:** The projector automatically reconnects every 2.5s. Ceremony state is stored in `presentation_state` table; reconnecting instantly recovers the active reveal stage without resetting.
2. **Venue Internet Outage:** Switch primary control laptop to local 5G hotspot. All core simulation logic is stateless and deterministic; uncommitted client forms store inputs in browser memory.
3. **Database Conflict / Lock Timeout:** The system uses idempotent transactions. If a simulation call fails, re-clicking "Run Simulation" safely re-runs the round without duplicating snapshots.

---

## 12. Correcting Disputed Results (Round Voiding)

If a volunteer digitized a sheet incorrectly and the round was simulated:
1. Navigate to `/admin/rounds`.
2. Select **"Void Round"**.
3. Enter mandatory Super Admin password confirmation and detailed audit reason (min 10 characters).
4. System sets round status back to `open`, marks old snapshots inactive, and logs an immutable audit event.
5. Correct the decision slip and re-simulate.

---

## 13. Ending & Archiving the Event

1. Once the Podium Ceremony concludes, navigate to `/admin/dashboard`.
2. Verify all 5 rounds have status `published`.
3. Click **"Archive Tournament"** to lock all mutations.
4. Export financial ledger and snapshot tables to CSV/Excel for competition records.

---

## 14. Event-Day Quick Checklist

| Time | Phase | Task | Status |
|------|-------|------|--------|
| T-90 min | Setup | Connect projector, test 1080p/4K fullscreen at `/presentation` | [ ] |
| T-60 min | Auth | Verify volunteer, coordinator, judge, and admin logins | [ ] |
| T-45 min | Roster | Verify 40 teams registered with correct domains and tables | [ ] |
| T-15 min | Test Run | Run dry-run simulation on disposable test event | [ ] |
| T-00 min | Round 1 | Open Round 1 for submissions | [ ] |
| Round 1 | Verify | Complete 40 double-blind paper sheet entries | [ ] |
| Round 1 | Simulate | Lock, verify policies, simulate Round 1, publish results | [ ] |
| Round 2 | VC Offer | Announce Round 2 investment offers to founders | [ ] |
| Round 3 | Mid-Game | Review domain highlights on main screen | [ ] |
| Round 4 | VC Offer | Announce Series B growth capital offers | [ ] |
| Round 5 | Finale | Simulate Round 5. DO NOT leak winner names | [ ] |
| Ceremony | Embargo | Verify `/leaderboard` shows Embargo Shield | [ ] |
| Ceremony | Reveal | Advance: Waiting -> 3rd -> 2nd -> 1st -> Podium | [ ] |
| Post-Event | Archive | Archive tournament and export master audit logs | [ ] |
