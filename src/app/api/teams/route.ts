import { NextRequest } from 'next/server';
import { TeamRegisterSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let eventId = searchParams.get('eventId');

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);

    if (!eventId) {
      const activeEvent = await service.getActiveEvent();
      eventId = activeEvent?.id;
    }

    if (!eventId) {
      return successResponse({ teams: [] });
    }

    const teams = await service.getTeams(eventId);
    return successResponse({ teams });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = TeamRegisterSchema.parse(body);

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const team = await service.registerTeam(validated);

    return successResponse({ team }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
