const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Money is stored as integer paise. */
export function formatInr(paise: number): string {
  return inr.format(Math.round(paise / 100));
}
