import { NextRequest } from 'next/server';
import { DecisionSubmitSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = DecisionSubmitSchema.parse(body);

    let supabase;
    let operatorId = '00000000-0000-0000-0000-000000000000';

    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        operatorId = user.id;
      } else {
        supabase = createAdminClient();
      }
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const decision = await service.submitDecision(validated, operatorId);

    return successResponse({
      decisionId: decision.id,
      teamId: decision.team_id,
      status: decision.status,
      marketingBudget: decision.marketing_budget,
      rdBudget: decision.rd_budget,
      productionUnits: decision.production_units,
      unitPrice: decision.unit_price,
      operationsBudget: decision.operations_budget,
      investmentDecision: decision.investment_decision,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
