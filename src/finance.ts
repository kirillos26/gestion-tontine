import type { Beneficiary, ScheduleRow, TontineData } from './types'

export const recommendedPayment = (contribution: number, duration: number) =>
  Math.max(0, Math.trunc(contribution)) * Math.max(0, Math.trunc(duration))

export function beneficiariesFor(data: Pick<TontineData, 'members'>): Beneficiary[] {
  return data.members.flatMap((member) => {
    const shares = Math.max(1, Math.trunc(member.shares))
    return Array.from({ length: shares }, (_, index) => ({
      id: `${member.id}:${index + 1}`,
      memberId: member.id,
      label: shares === 1 ? member.name.trim() : `${member.name.trim()} ${index + 1}`,
    }))
  })
}

export function fisherYates<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function orderedBeneficiaries(data: TontineData): Beneficiary[] {
  const all = beneficiariesFor(data)
  const byId = new Map(all.map((item) => [item.id, item]))
  const saved = data.beneficiaryOrder.map((id) => byId.get(id)).filter(Boolean) as Beneficiary[]
  const missing = all.filter((item) => !data.beneficiaryOrder.includes(item.id))
  if (data.orderMode === 'alphabetique') {
    return [...all].sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }))
  }
  return [...saved, ...missing]
}

export function addMonths(month: string, offset: number): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, mon - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildSchedule(data: TontineData): { rows: ScheduleRow[]; unserved: Beneficiary[] } {
  const all = beneficiariesFor(data)
  const lookup = new Map(all.map((item) => [item.id, item]))
  const order = orderedBeneficiaries(data)
  const served = new Set<string>()
  const totalShares = all.length
  const monthlyCollection = Math.trunc(data.contribution) * totalShares
  const standardPayment = data.paymentMode === 'recommande'
    ? recommendedPayment(data.contribution, data.duration)
    : Math.trunc(data.manualPayment)
  let carry = 0
  const rows: ScheduleRow[] = []

  for (let i = 0; i < data.duration; i += 1) {
    const month = addMonths(data.startMonth, i)
    const available = monthlyCollection + carry
    const historical = data.history.filter((operation) => operation.month === month)
    if (historical.length > 0) {
      let remaining = available
      const payments = historical
        .filter((operation) => lookup.has(operation.beneficiaryId) && !served.has(operation.beneficiaryId))
        .map((operation) => {
          const amount = Math.min(Math.max(0, Math.trunc(operation.amount)), remaining)
          remaining -= amount
          served.add(operation.beneficiaryId)
          return { beneficiaryId: operation.beneficiaryId, label: lookup.get(operation.beneficiaryId)!.label, amount }
        })
      carry = Math.min(Math.max(0, historical[historical.length - 1].carry), available - payments.reduce((sum, p) => sum + p.amount, 0))
      rows.push({ month, available, payments, carry, status: 'réalisé' })
      continue
    }

    const payments: ScheduleRow['payments'] = []
    let remaining = available
    if (standardPayment > 0) {
      for (const beneficiary of order) {
        if (served.has(beneficiary.id) || remaining < standardPayment) continue
        payments.push({ beneficiaryId: beneficiary.id, label: beneficiary.label, amount: standardPayment })
        served.add(beneficiary.id)
        remaining -= standardPayment
      }
    }
    carry = remaining
    rows.push({ month, available, payments, carry, status: 'prévu' })
  }

  return { rows, unserved: order.filter((beneficiary) => !served.has(beneficiary.id)) }
}
