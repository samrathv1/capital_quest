# CAPITAL QUEST — SUPER ADMIN PROVISIONING & SECURITY GUIDE

**Document Reference:** `CQ-SEC-PROVISIONING`  
**Target Environment:** Development & Production PostgreSQL  
**Supabase Project Reference:** `nlmegyvtecnapzeghobv`  

---

## 1. Security Overview & Threat Model

In Capital Quest, administrative privileges grant access to:
- Locking rounds and freezing student decision slips
- Executing official round simulations
- Performing non-destructive rollbacks
- Overriding financial transactions and audit logs

**Critical Security Rule:**
Public users and student participants **cannot promote themselves** to `super_admin`, `domain_coordinator`, or `judge`. Row-Level Security (RLS) policies on `public.profiles` (`profiles_admin_manage`) restrict all mutation operations exclusively to `public.is_super_admin()`.

---

## 2. Provisioning Procedure for Super Admin

To provision the first Super Admin in the development or production environment:

### Method A: Automated CLI Execution (Recommended)

Run the secure SQL provisioning script via the Supabase CLI:

```bash
npx supabase db query --linked --file scripts/provision-super-admin.sql
```

This script:
1. Verifies if the target email (`admin@capitalquest.dev` or custom organizer email) exists in `auth.users`.
2. Creates the user record with strong salted password if not present.
3. Sets `role = 'super_admin'` and `is_active = true` in `public.profiles`.

### Method B: SQL Console / Supabase Dashboard

If running directly in the Supabase SQL Editor:

```sql
-- 1. Identify user UUID by email
SELECT id, email FROM auth.users WHERE email = 'your-email@domain.edu';

-- 2. Upgrade user profile to super_admin
UPDATE public.profiles
SET role = 'super_admin', is_active = true, updated_at = timezone('utc', now())
WHERE id = '<USER_UUID_FROM_STEP_1>';
```

---

## 3. Seed Development Tournament Environment

To seed a complete development competition environment with:
- `Capital Quest 2026` event
- 4 Core Domains (`CLEAN`, `HEALTH`, `SAAS`, `D2C`)
- 5 Rounds (Round 1 `OPEN`)
- 8 Initial Teams (2 per domain)
- Seeded Roster Founders

Execute:

```bash
npx supabase db query --linked --file scripts/seed-development-tournament.sql
```

---

## 4. Default Development Credentials

| Role | Email | Password | Primary Workspace |
|---|---|---|---|
| **Super Admin** | `admin@capitalquest.dev` | `CapitalQuest2026!` | `/admin/dashboard` |
| **Volunteer Operator** | `volunteer@capitalquest.dev` | `CapitalQuest2026!` | `/volunteer/entry` |

*(Note: Change passwords immediately in production instances).*
