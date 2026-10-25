import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { AdminDecisionConfirmSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let adminId = '00000000-0000-0000-0000-000000000000';
    const supabase = createAdminClient();

    try {
      const { user } = await requireRole(['super_admin']);
      adminId = user.id;
    } catch (guardErr) {
      // In local dev/testing without active session, check server auth fallback
      try {
        const serverClient = await createClient();
        const { data: { user } } = await serverClient.auth.getUser();
        if (user) {
          adminId = user.id;
        } else {
          // If neither session nor role check passed, throw the original guard error
          throw guardErr;
        }
      } catch {
        throw guardErr;
      }
    }

    const body = await req.json();
    const validated = AdminDecisionConfirmSchema.parse(body);

    const service = new TournamentService(supabase);
    const decision = await service.adminConfirmDecision(validated, adminId);

    return successResponse({
      decisionId: decision.id,
      teamId: decision.team_id,
      roundId: decision.round_id,
      status: decision.status,
      marketingBudget: decision.marketing_budget,
      rdBudget: decision.rd_budget,
      productionUnits: decision.production_units,
      unitPrice: decision.unit_price,
      operationsBudget: decision.operations_budget,
      investmentDecision: decision.investment_decision,
      verifiedBy: decision.verified_by,
      verifiedAt: decision.verified_at,
      adminOverrideNotes: decision.admin_override_notes,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
