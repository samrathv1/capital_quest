import { NextRequest } from 'next/server';
import { DecisionVerifySchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = DecisionVerifySchema.parse(body);

    let supabase;
    let verifierId = '00000000-0000-0000-0000-000000000000';

    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        verifierId = user.id;
      } else {
        supabase = createAdminClient();
      }
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const verified = await service.verifyDecision(validated, verifierId);

    return successResponse({
      decisionId: verified.id,
      status: verified.status,
      verifiedBy: verified.verified_by,
      verifiedAt: verified.verified_at,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
