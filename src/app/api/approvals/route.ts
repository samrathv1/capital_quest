import { NextRequest } from 'next/server';
import {
  recordOrganizerApproval,
  assertOrganizerPoliciesApproved,
  syncOrganizerPolicyApprovals,
} from '@/lib/services/organizer-approvals';
import { OrganizerApprovalSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventParam = searchParams.get('eventId');

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const targetEventId = eventParam && eventParam !== 'default-event'
      ? eventParam
      : (await service.getActiveEvent())?.id || 'default-event';

    // Hydrate persisted approvals from database
    const gates = await syncOrganizerPolicyApprovals(targetEventId, supabase);
    const status = assertOrganizerPoliciesApproved(targetEventId);

    return successResponse({
      eventId: targetEventId,
      gates,
      allApproved: status.approved,
      pendingPolicies: status.pendingPolicies,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventParam = searchParams.get('eventId');

    let supabase;
    let actorId: string | undefined;

    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      actorId = user?.id;
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const targetEventId = eventParam && eventParam !== 'default-event'
      ? eventParam
      : (await service.getActiveEvent())?.id || 'default-event';

    const body = await req.json();
    const validated = OrganizerApprovalSchema.parse(body);

    const updated = recordOrganizerApproval(targetEventId, validated);
    const status = assertOrganizerPoliciesApproved(targetEventId);

    // Persist immutable audit log of formal policy approval
    try {
      await service.logAuditEvent({
        actorId,
        action: 'organizer.policy_approval',
        entityName: 'events',
        entityId: targetEventId,
        beforeState: undefined,
        afterState: {
          ...updated,
          approvedAt: new Date().toISOString(),
          approverIdentity: validated.approvedBy,
        },
      });
    } catch {
      // Non-fatal if audit logging encounters a transient error
    }

    return successResponse({
      eventId: targetEventId,
      gates: updated,
      allApproved: status.approved,
      pendingPolicies: status.pendingPolicies,
      message: status.approved
        ? 'All required organizer policies have been formally approved. Live simulations and publications are unlocked.'
        : 'Organizer policy approvals updated, but some policies are still pending.',
    });
  } catch (err) {
    return errorResponse(err);
  }
}
