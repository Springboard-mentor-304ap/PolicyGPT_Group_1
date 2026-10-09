export interface FAQ {
  faq_id: number;
  question: string;
  answer: string;
  category?: string | null;
  status?: string;
  display_order?: number;
  /** Canonical audience codes allowed to see this FAQ, or ['ALL']. */
  target_roles?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface FAQCreate {
  question: string;
  answer: string;
  category?: string | null;
  status?: string;
  display_order?: number;
  target_roles?: string[] | null;
}

export interface FAQUpdate {
  question?: string;
  answer?: string;
  category?: string | null;
  status?: string;
  display_order?: number;
  target_roles?: string[] | null;
}

/** Canonical FAQ audience codes (backend normalizes aliases to these). */
export const FAQ_AUDIENCE_ALL = 'ALL';

export interface FaqAudienceOption {
  value: string;
  label: string;
  shortLabel: string;
}

export const FAQ_AUDIENCE_OPTIONS: FaqAudienceOption[] = [
  { value: 'ALL', label: 'All Users', shortLabel: 'All' },
  { value: 'CITIZEN', label: 'Citizens', shortLabel: 'Citizen' },
  { value: 'RESEARCHER', label: 'Researchers', shortLabel: 'Researcher' },
  { value: 'ORGANIZATION', label: 'Organizations', shortLabel: 'Organization' },
  {
    value: 'GOVERNMENT_OFFICIAL',
    label: 'Government Officials',
    shortLabel: 'Government',
  },
  { value: 'ADMIN', label: 'Administrators', shortLabel: 'Admin' },
  { value: 'GUEST', label: 'Guest Users', shortLabel: 'Guest' },
];

/** Compact chip label for an audience code (falls back to the raw code). */
export function faqAudienceLabel(code: string): string {
  const found = FAQ_AUDIENCE_OPTIONS.find(
    (o) => o.value === (code || '').toUpperCase(),
  );
  return found ? found.shortLabel : code;
}

/** Normalize a selection the same way the backend does: ALL overrides. */
export function normalizeFaqAudience(selection: string[]): string[] {
  const codes = Array.from(
    new Set(
      (selection || [])
        .map((s) => (s || '').toUpperCase())
        .filter((s) => s),
    ),
  );
  if (codes.includes(FAQ_AUDIENCE_ALL)) {
    return [FAQ_AUDIENCE_ALL];
  }
  return codes;
}

/** Audience chips for list display; NULL/empty legacy rows count as ALL. */
export function faqAudienceChips(faq: FAQ): string[] {
  const roles = faq.target_roles;
  if (!roles || roles.length === 0) {
    return [FAQ_AUDIENCE_ALL];
  }
  return roles.map((r) => (r || '').toUpperCase());
}
