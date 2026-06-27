/** A MongoDB ObjectId rendered as a 24-character hex string. */
export type Id = string;

/** Milliseconds since the Unix epoch. */
export type EpochMs = number;

/** An ISO-8601 timestamp string (e.g. `2026-06-27T03:00:00.000Z`). */
export type IsoDateTime = string;

/** Standard error envelope returned by the REST API (canon §10). */
export interface ApiErrorBody {
  error: {
    /** SCREAMING_SNAKE machine code, e.g. `INVALID_CREDENTIALS`. */
    code: string;
    /** Human-readable message (safe to surface to clients). */
    message: string;
    /** Optional field-level validation details. */
    details?: Record<string, string[]>;
    /** Correlation id tying the error to server logs. */
    correlationId?: string;
  };
}
