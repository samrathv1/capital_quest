import { NextRequest } from 'next/server';
import { PublishRoundSchema } from '@/lib/validation/api-schemas';
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
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty
    }
    PublishRoundSchema.parse(body);

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
    const publishedRound = await service.publishRound(roundId, adminId);

    return successResponse({
      roundId: publishedRound.id,
      status: publishedRound.status,
      publishedAt: publishedRound.published_at,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
