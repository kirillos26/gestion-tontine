export type OrderMode = 'alphabetique' | 'aleatoire' | 'manuel'
export type PaymentMode = 'recommande' | 'manuel'

export interface Member {
  id: string
  name: string
  shares: number
}

export interface Beneficiary {
  id: string
  memberId: string
  label: string
}

export interface PastOperation {
  id: string
  month: string
  beneficiaryId: string
  amount: number
  carry: number
}

export interface TontineData {
  id?: string
  name: string
  startMonth: string
  duration: number
  contribution: number
  members: Member[]
  orderMode: OrderMode
  beneficiaryOrder: string[]
  paymentMode: PaymentMode
  manualPayment: number
  history: PastOperation[]
}

export interface SchedulePayment {
  beneficiaryId: string
  label: string
  amount: number
}

export interface ScheduleRow {
  month: string
  available: number
  payments: SchedulePayment[]
  carry: number
  status: 'réalisé' | 'prévu'
}
