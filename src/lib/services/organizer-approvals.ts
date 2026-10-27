/**
 * CAPITAL QUEST — ORGANIZER POLICY APPROVALS GATE
 * Reference: CQ-SPEC-02, CQ-SPEC-11
 *
 * Implements policy approval governance to prevent unapproved organizer policies
 * from silently becoming immutable tournament rules without formal recorded approval.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface OrganizerPolicyGates {
  cashValuationPolicyApproved: boolean;
  corporateTaxationApproved: boolean;
  standardVCOffersApproved: boolean;
  strictSpendingRejectionApproved: boolean;
  proRataScalingApproved?: boolean; // Reconciled legacy identifier preserved for audit compatibility
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
    strictSpendingRejectionApproved: false,
    proRataScalingApproved: false,
  };
}

/**
 * Records formal organizer approval for an event.
 * Supports structured approval objects or individual string policy keys.
 */
export function recordOrganizerApproval(
  eventId: string,
  approvalOrKey: (Partial<OrganizerPolicyGates> & { approvedBy?: string }) | string,
  approverName?: string,
  approverId?: string
): OrganizerPolicyGates {
  const current = getOrganizerPolicyGates(eventId);

  let updates: Partial<OrganizerPolicyGates> = {};
  let approver = approverName || approverId || 'Organizer';

  if (typeof approvalOrKey === 'string') {
    const key = approvalOrKey.toLowerCase();
    if (key === 'cash_valuation' || key === 'cashvaluationpolicyapproved') {
      updates.cashValuationPolicyApproved = true;
    } else if (key === 'corporate_tax' || key === 'corporatetaxationapproved') {
      updates.corporateTaxationApproved = true;
    } else if (key === 'standard_vc_offers' || key === 'standardvcoffersapproved') {
      updates.standardVCOffersApproved = true;
    } else if (key === 'strict_spending' || key === 'strictspendingrejectionapproved') {
      updates.strictSpendingRejectionApproved = true;
    } else if (key === 'pro_rata_scaling' || key === 'proratascalingapproved') {
      updates.proRataScalingApproved = true;
    } else if (key === 'all') {
      updates = {
        cashValuationPolicyApproved: true,
        corporateTaxationApproved: true,
        standardVCOffersApproved: true,
        strictSpendingRejectionApproved: true,
        proRataScalingApproved: true,
      };
    }
  } else if (approvalOrKey && typeof approvalOrKey === 'object') {
    updates = { ...approvalOrKey };
    if (approvalOrKey.approvedBy) {
      approver = approvalOrKey.approvedBy;
    }
  }

  const updated: OrganizerPolicyGates = {
    ...current,
    ...updates,
    strictSpendingRejectionApproved: updates.strictSpendingRejectionApproved ?? current.strictSpendingRejectionApproved,
    proRataScalingApproved: updates.proRataScalingApproved ?? current.proRataScalingApproved,
    approvedBy: approver,
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
  if (!gates.strictSpendingRejectionApproved) {
    pendingPolicies.push('Strict Spending Solvency Policy (Rejection of overspending decisions with zero auto-scaling)');
  }

  return {
    approved: pendingPolicies.length === 0,
    pendingPolicies,
  };
}

/**
 * Hydrates and synchronizes organizer policy approvals from persisted audit logs.
 */
export async function syncOrganizerPolicyApprovals(
  eventId: string,
  supabaseClient?: SupabaseClient
): Promise<OrganizerPolicyGates> {
  if (supabaseClient && eventId && eventId !== 'default-event') {
    try {
      const { data: audit } = await supabaseClient
        .from('audit_logs')
        .select('after_state')
        .eq('entity_name', 'events')
        .eq('entity_id', eventId)
        .eq('action', 'organizer.policy_approval')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (audit?.after_state) {
        const persisted = audit.after_state as Partial<OrganizerPolicyGates>;
        const current = getOrganizerPolicyGates(eventId);
        const merged: OrganizerPolicyGates = {
          ...current,
          cashValuationPolicyApproved: Boolean(persisted.cashValuationPolicyApproved),
          corporateTaxationApproved: Boolean(persisted.corporateTaxationApproved),
          standardVCOffersApproved: Boolean(persisted.standardVCOffersApproved),
          strictSpendingRejectionApproved: Boolean(persisted.strictSpendingRejectionApproved),
          proRataScalingApproved: Boolean(persisted.proRataScalingApproved),
          approvedBy: persisted.approvedBy || current.approvedBy,
          approvedAt: persisted.approvedAt || current.approvedAt,
        };
        eventApprovalRegistry.set(eventId, merged);
        return merged;
      }
    } catch {
      // Fallback to in-memory registry
    }
  }

  return getOrganizerPolicyGates(eventId);
}
