import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { UpdatePresentationStateSchema } from '@/lib/validation/api-schemas';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['super_admin', 'judge']);

    const { searchParams } = new URL(req.url);
    const eventIdParam = searchParams.get('eventId') || undefined;

    const supabase = createAdminClient();
    const service = new TournamentService(supabase);
    const adminData = await service.getAdminPresentationData(eventIdParam);

    return successResponse(adminData, 200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireRole(['super_admin', 'judge']);

    const body = await req.json();
    const parsed = UpdatePresentationStateSchema.parse(body);

    const supabase = createAdminClient();
    const service = new TournamentService(supabase);

    let eventId: string;
    if (parsed.eventId) {
      eventId = parsed.eventId;
    } else {
      const activeEvent = await service.getActiveEvent();
      if (!activeEvent) {
        throw new Error('No active event found to update presentation state.');
      }
      eventId = activeEvent.id;
    }

    const updatedState = await service.updatePresentationState(
      eventId,
      {
        mode: parsed.mode,
        selectedRoundNumber: parsed.selectedRoundNumber,
        domainFilter: parsed.domainFilter,
        ceremonyStage: parsed.ceremonyStage,
      },
      user.id
    );

    return successResponse({
      success: true,
      presentationState: updatedState,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
