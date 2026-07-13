import { create } from 'zustand'

import { loadCustomProvidersConfig } from '../utils/custom-providers'

import type { CustomProvidersConfig } from '../utils/custom-providers'

interface CustomProviderStore {
  config: CustomProvidersConfig
  refresh: () => void
}

export const useCustomProviderStore = create<CustomProviderStore>((set) => ({
  config: loadCustomProvidersConfig(),
  refresh: () => set({ config: loadCustomProvidersConfig() }),
}))

export function refreshCustomProviderStore(): void {
  useCustomProviderStore.getState().refresh()
}
