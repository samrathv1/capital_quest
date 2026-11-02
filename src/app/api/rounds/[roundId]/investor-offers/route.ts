import { NextRequest } from 'next/server';
import { getCurrentUserProfile, requireRole } from '@/lib/auth/guards';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';
import { ConfirmInvestorOfferSchema } from '@/lib/validation/api-schemas';
import { AppError } from '@/lib/errors/app-error';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ roundId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { roundId } = await context.params;
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('teamId');

    const supabase = createAdminClient();
    const service = new TournamentService(supabase);

    const { user, profile } = await getCurrentUserProfile();
    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Authentication required to view investor offers.', 401);
    }

    const callerRole = profile?.role;
    const isElevatedAdmin = callerRole === 'super_admin' || callerRole === 'domain_coordinator';

    if (teamId) {
      // Tenant Isolation: If not an elevated admin, verify team membership
      if (!isElevatedAdmin) {
        const { data: membership } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', teamId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!membership) {
          throw new AppError('FORBIDDEN', 'Access denied: You may only view investment offers for your assigned team.', 403);
        }
      }

      const offer = await service.getOrGenerateTeamInvestorOffers(roundId, teamId, callerRole);
      return successResponse(offer, 200, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
    }

    // If no teamId provided, only elevated admins may query all offers for the round
    if (!isElevatedAdmin) {
      throw new AppError('FORBIDDEN', 'Querying all team investor offers requires administrator privileges.', 403);
    }

    const roundDecisions = await service.getAdminRoundDecisions(roundId);
    const offers = roundDecisions.teams.map(t => ({
      teamId: t.teamId,
      teamCode: t.teamCode,
      companyName: t.companyName,
      domainCode: t.domainCode,
      currentFounderEquityPct: t.currentFounderEquityPct,
      investorOffer: t.investorOffer,
    }));

    return successResponse(offers, 200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { roundId } = await context.params;
    // Strict role enforcement: Only super_admin or domain_coordinator may confirm offers
    const { user } = await requireRole(['super_admin', 'domain_coordinator']);
    const adminId = user.id;

    const body = await req.json();
    const validated = ConfirmInvestorOfferSchema.parse(body);

    const supabase = createAdminClient();
    const service = new TournamentService(supabase);

    const result = await service.confirmTeamInvestmentChoice({
      roundId,
      teamId: validated.teamId,
      choice: validated.choice,
      adminId,
    });

    return successResponse(result, 200);
  } catch (err) {
    return errorResponse(err);
  }
}
