/**
 * Canonical brand colors for non-CSS surfaces such as emails and documents.
 * The web application implements the same identity with OKLCH CSS variables.
 */
export const brandColors = {
  navy: '#0c2340',
  blue: '#1d4e89',
  teal: '#0f6e6e',
  paper: '#f6f1e7',
  ink: '#1c2430',
} as const;

export const statusTones = ['neutral', 'info', 'success', 'warning', 'danger'] as const;

export type StatusTone = (typeof statusTones)[number];
