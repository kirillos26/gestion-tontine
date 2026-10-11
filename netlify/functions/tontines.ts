import { createHash, randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'

interface TontineData {
  id?: string
  name: string
  startMonth: string
  duration: number
  contribution: number
  members: Array<{ id: string; name: string; shares: number }>
  orderMode: 'alphabetique' | 'aleatoire' | 'manuel'
  beneficiaryOrder: string[]
  paymentMode: 'recommande' | 'manuel'
  manualPayment: number
  history: Array<{ id: string; month: string; beneficiaryId: string; amount: number; carry: number }>
}

interface RequestBody {
  action?: 'create' | 'open' | 'update'
  code?: string
  data?: TontineData
}

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

const keyFor = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex')

const validData = (data: unknown): data is TontineData => {
  if (!data || typeof data !== 'object') return false
  const value = data as Partial<TontineData>
  return typeof value.name === 'string' && value.name.trim().length > 0 &&
    typeof value.startMonth === 'string' &&
    Number.isInteger(value.duration) && Number(value.duration) > 0 &&
    Number.isInteger(value.contribution) && Number(value.contribution) > 0 &&
    Array.isArray(value.members) && value.members.length > 0 &&
    Array.isArray(value.beneficiaryOrder) && Array.isArray(value.history)
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  let body: RequestBody
  try {
    body = await request.json() as RequestBody
  } catch {
    return json({ error: 'Requête invalide.' }, 400)
  }

  const code = body.code?.trim() ?? ''
  if (code.length < 20 || code.length > 100) return json({ error: 'Code d’accès invalide.' }, 400)

  const store = getStore({ name: 'tontines', consistency: 'strong' })
  const key = keyFor(code)

  try {
    if (body.action === 'create') {
      if (!validData(body.data)) return json({ error: 'Les données de la tontine sont invalides.' }, 400)
      const data = { ...body.data, id: randomUUID() }
      const result = await store.setJSON(key, data, { onlyIfNew: true })
      if (!result.modified) return json({ error: 'Ce code d’accès existe déjà. Réessayez.' }, 409)
      return json({ data }, 201)
    }

    const existing = await store.get(key, { type: 'json' }) as TontineData | null
    if (!existing) return json({ error: 'Code introuvable ou invalide.' }, 404)

    if (body.action === 'open') return json({ data: existing })

    if (body.action === 'update') {
      if (!validData(body.data)) return json({ error: 'Les données de la tontine sont invalides.' }, 400)
      const data = { ...body.data, id: existing.id }
      await store.setJSON(key, data)
      return json({ data })
    }

    return json({ error: 'Action inconnue.' }, 400)
  } catch (error) {
    console.error('Erreur de stockage de la tontine', error)
    return json({ error: 'Le service de sauvegarde est temporairement indisponible.' }, 500)
  }
}
