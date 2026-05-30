/**
 * Injection token breakdown for dashboards and reports.
 */

export interface InjectionSlice {
  label: string
  tokens: number
  percent: number
}

export function buildInjectionBreakdown(slices: { label: string; tokens: number }[]): InjectionSlice[] {
  const total = slices.reduce((s, x) => s + x.tokens, 0)
  if (total === 0) {
    return slices.map(s => ({ ...s, percent: 0 }))
  }
  return slices
    .filter(s => s.tokens > 0)
    .map(s => ({
      label: s.label,
      tokens: s.tokens,
      percent: Math.round((s.tokens / total) * 100),
    }))
}
