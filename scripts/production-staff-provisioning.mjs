/**
 * CAPITAL QUEST — PRODUCTION STAFF PROVISIONING AUTOMATION
 * 
 * Safely provisions authorized event staff accounts using the official
 * Supabase GoTrue Admin API.
 * 
 * Usage:
 *   SUPABASE_URL=https://<project-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-secret> \
 *   node scripts/production-staff-provisioning.mjs
 * 
 * Rules:
 *   - Uses official auth.admin.createUser API (no raw SQL inserts into auth.users)
 *   - Sets pre-confirmed email to avoid email rate limits during event setup
 *   - Inserts/upserts canonical public.profiles with authoritative roles
 *   - Never deletes existing accounts or runs destructive queries
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Missing required SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  console.error('Example: SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=secret node scripts/production-staff-provisioning.mjs');
  process.exit(1);
}

const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Production staff roster template (to be customized with actual organizer emails/credentials)
const staffRoster = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@capitalquest.dev',
    password: process.env.ADMIN_PASSWORD,
    name: 'Lead Super Administrator',
    role: 'super_admin'
  },
  {
    email: process.env.VOLUNTEER1_EMAIL || 'volunteer@capitalquest.dev',
    password: process.env.VOLUNTEER1_PASSWORD,
    name: 'Staff Volunteer Lead (Operator A)',
    role: 'volunteer'
  },
  {
    email: process.env.VOLUNTEER2_EMAIL || 'volunteer2@capitalquest.dev',
    password: process.env.VOLUNTEER2_PASSWORD,
    name: 'Staff Volunteer Verifier (Operator B)',
    role: 'volunteer'
  },
  {
    email: process.env.JUDGE_EMAIL || 'judge@capitalquest.dev',
    password: process.env.JUDGE_PASSWORD,
    name: 'Lead Competition Judge',
    role: 'judge'
  }
];

async function provisionStaff() {
  console.log('--- CAPITAL QUEST PRODUCTION STAFF PROVISIONING ---');
  console.log(`Target Supabase URL: ${supabaseUrl}`);

  // Fetch existing users to ensure idempotency
  const { data: userList, error: listError } = await adminSupabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to query existing auth users:', listError);
    process.exit(1);
  }

  const existingUsersByEmail = new Map(userList.users.map(u => [u.email?.toLowerCase(), u]));

  for (const staff of staffRoster) {
    if (!staff.password) {
      console.warn(`[SKIP] Missing password for ${staff.email}. Set corresponding environment variable.`);
      continue;
    }

    let userId;
    const existing = existingUsersByEmail.get(staff.email.toLowerCase());

    if (existing) {
      console.log(`[EXISTING] User ${staff.email} already exists (UID: ${existing.id}). Updating password and metadata...`);
      userId = existing.id;
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(userId, {
        password: staff.password,
        email_confirm: true,
        user_metadata: { full_name: staff.name }
      });
      if (updateError) {
        console.error(`Failed to update ${staff.email}:`, updateError);
        continue;
      }
    } else {
      console.log(`[CREATE] Creating new user ${staff.email} (${staff.role})...`);
      const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
        email: staff.email,
        password: staff.password,
        email_confirm: true,
        user_metadata: { full_name: staff.name }
      });
      if (createError) {
        console.error(`Failed to create ${staff.email}:`, createError);
        continue;
      }
      userId = newUser.user.id;
      console.log(`Successfully created user ${staff.email} (UID: ${userId})`);
    }

    // Upsert public.profiles record
    console.log(`[PROFILE] Linking profile for ${staff.email} with role: ${staff.role}...`);
    const { error: profileError } = await adminSupabase.from('profiles').upsert({
      id: userId,
      email: staff.email,
      full_name: staff.name,
      role: staff.role,
      is_active: true,
      updated_at: new Date().toISOString()
    });

    if (profileError) {
      console.error(`Failed to upsert profile for ${staff.email}:`, profileError);
    } else {
      console.log(`[SUCCESS] Profile linked: ${staff.email} -> ${staff.role}`);
    }
  }

  console.log('\nStaff provisioning routine completed.');
}

provisionStaff().catch(err => {
  console.error('Fatal error in provisioning script:', err);
  process.exit(1);
});
