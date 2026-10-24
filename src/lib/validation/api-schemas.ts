import { z } from 'zod';

export const DecisionSubmitSchema = z.object({
  roundId: z.string().uuid('Invalid roundId UUID format'),
  teamId: z.string().uuid('Invalid teamId UUID format'),
  marketingBudget: z.number().min(0, 'Marketing budget must be non-negative'),
  rdBudget: z.number().min(0, 'R&D budget must be non-negative'),
  productionUnits: z.number().int().min(0, 'Production units must be an integer >= 0'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  operationsBudget: z.number().min(0, 'Operations budget must be non-negative'),
  investmentDecision: z.enum(['none', 'offer_a', 'offer_b', 'reject_both']).default('none'),
});

export const DecisionVerifySchema = DecisionSubmitSchema;

export const LockRoundSchema = z.object({
  overrideMissing: z.boolean().default(false),
});

export const SimulateRoundSchema = z.object({
  isDryRun: z.boolean().default(false),
  idempotencyKey: z.string().optional(),
  requireOrganizerApproval: z.boolean().default(true),
});

export const VoidRoundSchema = z.object({
  adminPasswordConfirm: z.string().min(8, 'Admin password confirmation required'),
  reason: z.string().min(10, 'A detailed audit reason (min 10 characters) is mandatory for round corrections'),
});

export const PublishRoundSchema = z.object({
  confirmPublish: z.boolean(),
});

export const OrganizerApprovalSchema = z.object({
  cashValuationPolicyApproved: z.boolean().default(true),
  corporateTaxationApproved: z.boolean().default(true),
  standardVCOffersApproved: z.boolean().default(true),
  proRataScalingApproved: z.boolean().default(true),
  approvedBy: z.string().min(1, 'Approver name or ID required'),
});

export const TeamRegisterSchema = z.object({
  eventId: z.string().uuid('Invalid eventId UUID format'),
  domainId: z.string().uuid('Invalid domainId UUID format'),
  teamCode: z.string().min(2, 'Team code must be at least 2 characters').max(10, 'Team code too long').trim().toUpperCase(),
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100, 'Company name too long').trim(),
  tableStation: z.string().max(20).optional(),
});

export const TeamMemberSchema = z.object({
  teamId: z.string().uuid('Invalid teamId UUID format'),
  fullName: z.string().min(2, 'Full name required').max(100).trim(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  studentId: z.string().max(50).optional(),
  roleTitle: z.string().max(50).default('Co-Founder'),
});

export type DecisionSubmitInput = z.infer<typeof DecisionSubmitSchema>;
export type SimulateRoundInput = z.infer<typeof SimulateRoundSchema>;
export type VoidRoundInput = z.infer<typeof VoidRoundSchema>;
export type OrganizerApprovalInput = z.infer<typeof OrganizerApprovalSchema>;
export type TeamRegisterInput = z.infer<typeof TeamRegisterSchema>;
export type TeamMemberInput = z.infer<typeof TeamMemberSchema>;
