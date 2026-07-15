import { refreshNvidiaNimModels } from './nvidia-nim-provider'
import { refreshBundledOpenCodeProviders } from './opencode-providers'

export interface ProviderCatalogRefreshResult {
  warnings: string[]
}

export async function refreshProviderCatalogs(params: {
  configDir?: string
  signal?: AbortSignal
} = {}): Promise<ProviderCatalogRefreshResult> {
  const [openCodeResult, nvidiaResult] = await Promise.allSettled([
    refreshBundledOpenCodeProviders(params),
    refreshNvidiaNimModels(params),
  ])
  const warnings: string[] = []

  if (openCodeResult.status === 'fulfilled') {
    warnings.push(...openCodeResult.value.warnings)
  } else {
    warnings.push(
      `OpenCode: ${
        openCodeResult.reason instanceof Error
          ? openCodeResult.reason.message
          : String(openCodeResult.reason)
      }`,
    )
  }

  if (nvidiaResult.status === 'rejected') {
    warnings.push(
      `NVIDIA NIM: ${
        nvidiaResult.reason instanceof Error
          ? nvidiaResult.reason.message
          : String(nvidiaResult.reason)
      }`,
    )
  }

  return { warnings }
}
