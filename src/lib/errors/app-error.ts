/**
 * CAPITAL QUEST — APPLICATION ERROR ARCHITECTURE
 * Reference: CQ-SPEC-08
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ROUND_NOT_DRAFT'
  | 'ROUND_NOT_OPEN'
  | 'ROUND_NOT_LOCKED'
  | 'ROUND_NOT_SIMULATED'
  | 'ROUND_NOT_REVIEWED'
  | 'PREVIOUS_ROUND_NOT_PUBLISHED'
  | 'RECONCILIATION_FAILED'
  | 'POLICIES_NOT_APPROVED'
  | 'OVERSPENT_BUDGET'
  | 'INVALID_PRICE_RANGE'
  | 'MISSING_SUBMISSIONS'
  | 'SIMULATION_FAILED'
  | 'ROLLBACK_FAILED'
  | 'ORGANIZER_APPROVALS_PENDING'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CASCADE_GUARD_VIOLATION'
  | 'VALIDATION_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }
}
