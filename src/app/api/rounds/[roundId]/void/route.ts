import { NextRequest } from 'next/server';
import { VoidRoundSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    const body = await req.json();
    const validated = VoidRoundSchema.parse(body);

    let supabase;
    let adminId = '00000000-0000-0000-0000-000000000000';

    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        adminId = user.id;
      } else {
        supabase = createAdminClient();
      }
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const voidResult = await service.voidRound(roundId, adminId, validated);

    return successResponse(voidResult);
  } catch (err) {
    return errorResponse(err);
  }
}
