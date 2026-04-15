import { get, set, del } from 'idb-keyval'
import type { Uint8Array_ } from '@repo/types'

const SEED_KEY = 'nostr-chat:seed'

export const saveSeed = async (seed: Uint8Array_): Promise<void> => {
  await set(SEED_KEY, seed)
}

export const loadSeed = async (): Promise<Uint8Array_ | undefined> => {
  return get<Uint8Array_>(SEED_KEY)
}

export const clearSeed = async (): Promise<void> => {
  await del(SEED_KEY)
}
