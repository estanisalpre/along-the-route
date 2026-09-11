export interface LoanOption {
  id: string
  principal: number
  /** Tasa total del préstamo (no anual): total a devolver = principal * (1 + interestRate). */
  interestRate: number
  termDays: number
}

export interface Loan extends LoanOption {
  totalToRepay: number
  dailyQuota: number
  startTimestamp: number
}

// Montos, interés y plazo elegidos para que la cuota diaria dé un número redondo.
export const LOAN_OPTIONS: LoanOption[] = [
  { id: 'chico', principal: 50_000_000, interestRate: 0.2, termDays: 100 },
  { id: 'medio', principal: 100_000_000, interestRate: 0.25, termDays: 125 },
  { id: 'grande', principal: 250_000_000, interestRate: 0.3, termDays: 250 },
]

export function quoteLoan(option: LoanOption): { totalToRepay: number; dailyQuota: number } {
  const totalToRepay = Math.round(option.principal * (1 + option.interestRate))
  return { totalToRepay, dailyQuota: Math.round(totalToRepay / option.termDays) }
}

export function createLoan(option: LoanOption, startTimestamp: number): Loan {
  const { totalToRepay, dailyQuota } = quoteLoan(option)
  return { ...option, totalToRepay, dailyQuota, startTimestamp }
}
