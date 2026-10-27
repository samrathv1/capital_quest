import { NextRequest } from 'next/server';
import { SimulateRoundSchema } from '@/lib/validation/api-schemas';
import { executeSimulationRound } from '@/lib/services/simulation-runner';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty
    }
    const validated = SimulateRoundSchema.parse(body);

    let adminId = '00000000-0000-0000-0000-000000000000';

    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        adminId = user.id;
      }
    } catch {
      // Unauthenticated / fallback
    }

    // fn_commit_simulation_run is restricted to service_role to ensure atomic integrity
    const supabase = createAdminClient();

    const output = await executeSimulationRound({
      roundId,
      adminId,
      isDryRun: validated.isDryRun,
      idempotencyKey: validated.idempotencyKey,
      requireOrganizerApproval: validated.requireOrganizerApproval,
      supabaseClient: supabase,
    });

    return successResponse(output);
  } catch (err) {
    return errorResponse(err);
  }
}
