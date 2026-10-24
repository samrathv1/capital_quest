/**
 * CAPITAL QUEST — ORGANIZER POLICY APPROVALS GATE
 * Reference: CQ-SPEC-02, CQ-SPEC-11
 *
 * Implements policy approval governance to prevent unapproved organizer policies
 * from silently becoming immutable tournament rules without formal recorded approval.
 */

export interface OrganizerPolicyGates {
  cashValuationPolicyApproved: boolean;
  corporateTaxationApproved: boolean;
  standardVCOffersApproved: boolean;
  proRataScalingApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

// In-memory / config approval registry (can also be persisted in event metadata or profiles)
const eventApprovalRegistry = new Map<string, OrganizerPolicyGates>();

/**
 * Returns the current organizer policy approval status for an event.
 */
export function getOrganizerPolicyGates(eventId: string): OrganizerPolicyGates {
  const existing = eventApprovalRegistry.get(eventId);
  if (existing) {
    return existing;
  }

  // Default: unapproved policies awaiting formal organizer sign-off
  return {
    cashValuationPolicyApproved: false,
    corporateTaxationApproved: false,
    standardVCOffersApproved: false,
    proRataScalingApproved: false,
  };
}

/**
 * Records formal organizer approval for an event.
 */
export function recordOrganizerApproval(
  eventId: string,
  approval: Partial<OrganizerPolicyGates> & { approvedBy: string }
): OrganizerPolicyGates {
  const current = getOrganizerPolicyGates(eventId);
  const updated: OrganizerPolicyGates = {
    ...current,
    ...approval,
    approvedBy: approval.approvedBy,
    approvedAt: new Date().toISOString(),
  };

  eventApprovalRegistry.set(eventId, updated);
  return updated;
}

/**
 * Verifies that all required organizer policy decisions have been formally approved.
 * Throws an error or returns missing policies if not approved.
 */
export function assertOrganizerPoliciesApproved(eventId: string): {
  approved: boolean;
  pendingPolicies: string[];
} {
  const gates = getOrganizerPolicyGates(eventId);
  const pendingPolicies: string[] = [];

  if (!gates.cashValuationPolicyApproved) {
    pendingPolicies.push('Cash Valuation Contribution Policy (0.25 * max(0, Cash - $250k))');
  }
  if (!gates.corporateTaxationApproved) {
    pendingPolicies.push('Corporate Taxation Policy (20% tax rate with NOL carryforward deducted in current round)');
  }
  if (!gates.standardVCOffersApproved) {
    pendingPolicies.push('Standardized Uniform VC Offers Policy (R2 Seed and R4 Series A parameters)');
  }
  if (!gates.proRataScalingApproved) {
    pendingPolicies.push('Pro-Rata Spending Scaling for Minor Cash Deficits (<5%)');
  }

  return {
    approved: pendingPolicies.length === 0,
    pendingPolicies,
  };
}
