import { NextRequest } from 'next/server';
import {
  getOrganizerPolicyGates,
  recordOrganizerApproval,
  assertOrganizerPoliciesApproved,
} from '@/lib/services/organizer-approvals';
import { OrganizerApprovalSchema } from '@/lib/validation/api-schemas';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId') || 'default-event';

    const gates = getOrganizerPolicyGates(eventId);
    const status = assertOrganizerPoliciesApproved(eventId);

    return successResponse({
      eventId,
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
    const eventId = searchParams.get('eventId') || 'default-event';

    const body = await req.json();
    const validated = OrganizerApprovalSchema.parse(body);

    const updated = recordOrganizerApproval(eventId, validated);
    const status = assertOrganizerPoliciesApproved(eventId);

    return successResponse({
      eventId,
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
