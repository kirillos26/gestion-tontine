import { describe, expect, it } from 'vitest'
import { beneficiariesFor, buildSchedule, recommendedPayment } from './finance'
import type { TontineData } from './types'

const base = (overrides: Partial<TontineData> = {}): TontineData => ({
  name: 'Test', startMonth: '2026-01', duration: 4, contribution: 1000,
  members: [{ id: 'a', name: 'Awa', shares: 1 }], orderMode: 'manuel',
  beneficiaryOrder: ['a:1'], paymentMode: 'recommande', manualPayment: 0, history: [], ...overrides,
})

describe('logique financière', () => {
  it('calcule le montant recommandé', () => expect(recommendedPayment(5000, 12)).toBe(60000))
  it('reporte le solde au mois suivant', () => {
    const data = base({ duration: 3, members: [{ id: 'a', name: 'Awa', shares: 2 }], beneficiaryOrder: ['a:1', 'a:2'] })
    const { rows } = buildSchedule(data)
    expect(rows[0].carry).toBe(2000)
    expect(rows[1].available).toBe(4000)
  })
  it('crée plusieurs bénéficiaires pour plusieurs parts', () => {
    expect(beneficiariesFor(base({ members: [{ id: 'a', name: 'Armel Foba', shares: 2 }] })).map((b) => b.label))
      .toEqual(['Armel Foba 1', 'Armel Foba 2'])
  })
  it('sert plusieurs bénéficiaires dans un mois', () => {
    const data = base({ duration: 2, contribution: 1000, members: [{ id: 'a', name: 'A', shares: 4 }], beneficiaryOrder: ['a:1', 'a:2', 'a:3', 'a:4'] })
    expect(buildSchedule(data).rows[0].payments).toHaveLength(2)
  })
  it("n'insère aucun bénéficiaire deux fois", () => {
    const data = base({ duration: 3, contribution: 1000, members: [{ id: 'a', name: 'A', shares: 3 }], beneficiaryOrder: ['a:1', 'a:2', 'a:3'] })
    const ids = buildSchedule(data).rows.flatMap((row) => row.payments.map((p) => p.beneficiaryId))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
