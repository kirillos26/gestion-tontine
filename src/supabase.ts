import { createClient } from '@supabase/supabase-js'
import type { TontineData } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const hasRealConfiguration = Boolean(
  url && key &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) &&
  !url.includes('votre-projet') &&
  !key.includes('votre-cle'),
)
export const configured = hasRealConfiguration
const supabase = configured ? createClient(url!, key!) : null

const configurationError = () => new Error(
  "Supabase n’est pas configuré : remplacez les valeurs d’exemple dans .env par l’URL et la clé publique anon de votre projet, puis redémarrez npm run dev.",
)

async function safely<T>(operation: () => PromiseLike<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      throw new Error('Impossible de joindre Supabase. Vérifiez l’URL dans .env, votre connexion internet, puis redémarrez l’application.')
    }
    throw error
  }
}

export function generateAccessCode(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function createTontine(data: TontineData, code: string): Promise<TontineData> {
  if (!supabase) throw configurationError()
  const { data: result, error } = await safely(() => supabase.rpc('create_tontine', { p_access_code: code, p_data: data }))
  if (error) throw new Error(error.message)
  return { ...data, id: result as string }
}

export async function openTontine(code: string): Promise<TontineData> {
  if (!supabase) throw configurationError()
  const { data, error } = await safely(() => supabase.rpc('open_tontine', { p_access_code: code.trim() }))
  if (error || !data) throw new Error('Code introuvable ou invalide.')
  return data as TontineData
}

export async function updateTontine(data: TontineData, code: string): Promise<void> {
  if (!supabase) throw configurationError()
  const { error } = await safely(() => supabase.rpc('update_tontine', { p_access_code: code, p_data: data }))
  if (error) throw new Error(error.message)
}
