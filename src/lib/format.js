export const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value) {
  return numberFormatter.format(value ?? 0);
}

export function formatPercent(value, digits = 1) {
  return `${(100 * (value ?? 0)).toFixed(digits)}%`;
}

export function candidateShortLabel(candidateName = '') {
  return candidateName.split(',')[0].replace(/\s+\/.*/, '').trim();
}
