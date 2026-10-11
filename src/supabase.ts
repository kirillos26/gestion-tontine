import type { TontineData } from './types'

export const configured = true

type Action = 'create' | 'open' | 'update'

interface ApiResponse {
  data?: TontineData
  error?: string
}

async function request(action: Action, code: string, data?: TontineData): Promise<TontineData | undefined> {
  let response: Response
  try {
    response = await fetch('/api/tontines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, code: code.trim(), data }),
    })
  } catch {
    throw new Error('Impossible de joindre le service de sauvegarde. Vérifiez votre connexion internet et réessayez.')
  }

  let result: ApiResponse
  try {
    result = await response.json() as ApiResponse
  } catch {
    throw new Error('Le service de sauvegarde a renvoyé une réponse invalide. Réessayez dans quelques instants.')
  }

  if (!response.ok) throw new Error(result.error || 'Impossible d’enregistrer la tontine.')
  return result.data
}

export function generateAccessCode(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function createTontine(data: TontineData, code: string): Promise<TontineData> {
  const created = await request('create', code, data)
  if (!created) throw new Error('La tontine n’a pas pu être créée.')
  return created
}

export async function openTontine(code: string): Promise<TontineData> {
  const data = await request('open', code)
  if (!data) throw new Error('Code introuvable ou invalide.')
  return data
}

export async function updateTontine(data: TontineData, code: string): Promise<void> {
  await request('update', code, data)
}
