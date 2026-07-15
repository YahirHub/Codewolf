import { create } from 'zustand'

import { loadAvailableProvidersConfig } from '../utils/custom-providers'

import type { CustomProvidersConfig } from '../utils/custom-providers'

interface CustomProviderStore {
  config: CustomProvidersConfig
  refresh: () => void
}

export const useCustomProviderStore = create<CustomProviderStore>((set) => ({
  config: loadAvailableProvidersConfig(),
  refresh: () => set({ config: loadAvailableProvidersConfig() }),
}))

export function refreshCustomProviderStore(): void {
  useCustomProviderStore.getState().refresh()
}
