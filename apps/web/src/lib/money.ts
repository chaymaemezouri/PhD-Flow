export function formatMoney(
  amount: number | null | undefined,
  currency = 'EUR',
  locale = 'fr',
) {
  if (amount == null || Number.isNaN(amount)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount);
  } catch {
    return `${amount} ${currency || 'EUR'}`;
  }
}
