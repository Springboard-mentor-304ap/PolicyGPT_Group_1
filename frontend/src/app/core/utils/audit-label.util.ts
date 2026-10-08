/**
 * Display-only formatter for backend enum-style values (audit actions,
 * entity types, etc.).
 *
 * Replaces underscores with spaces for human-readable UI labels.
 * The original API/database value is NEVER modified — always format at
 * the display site and keep raw values for filtering, search, export
 * matching and API payloads.
 *
 * Example: 'SUPPORT_REQUEST_RESPONDED' → 'SUPPORT REQUEST RESPONDED'
 */
export function formatAuditLabel(value: string | null | undefined): string {
  return (value ?? '').replace(/_/g, ' ').trim().toUpperCase();
}
