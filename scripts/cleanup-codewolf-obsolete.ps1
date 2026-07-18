[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Position = 0)]
    [string]$ProjectRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$packageJson = Join-Path $root 'package.json'

if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
    throw "No se encontró package.json en '$root'. Ejecuta este script desde la raíz de Codewolf o usa -ProjectRoot."
}

$package = Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json
if ($package.name -notin @('codewolf-project', 'codebuff-project')) {
    throw "El proyecto '$($package.name)' no parece ser Codewolf. Se canceló la limpieza."
}

# Estos directorios pertenecían por completo a Freebuff o a empaquetadores retirados.
$obsoleteDirectories = @(
    'freebuff'
    'cli/release'
    'cli/release-staging'
)

# Archivos concretos retirados tras comprobar imports, referencias y alcance desde el CLI.
$obsoleteFiles = @(
    'README.zh-CN.md'
    'agents/base-chat.ts'
    'agents/base2/base2-free-deepseek-flash.ts'
    'agents/base2/base2-free-deepseek.ts'
    'agents/base2/base2-free-evals.ts'
    'agents/base2/base2-free-glm.ts'
    'agents/base2/base2-free-kimi.ts'
    'agents/base2/base2-free-mimo-pro.ts'
    'agents/base2/base2-free-mimo.ts'
    'agents/base2/base2-free-minimax-m3.ts'
    'agents/base2/base2-free.ts'
    'agents/e2e/base2-free-summary-format.e2e.test.ts'
    'agents/reviewer/code-reviewer-deepseek-flash.ts'
    'agents/reviewer/code-reviewer-glm.ts'
    'agents/reviewer/code-reviewer-kimi.ts'
    'agents/reviewer/code-reviewer-mimo-pro.ts'
    'agents/reviewer/code-reviewer-mimo.ts'
    'agents/reviewer/code-reviewer-minimax-m3.ts'
    'assets/codebuff-vs-claude-code.png'
    'assets/multi-agents.png'
    'cli/scripts/release.ts'
    'cli/src/__tests__/integration/usage-refresh-on-completion.test.ts'
    'cli/src/__tests__/release/proxy-http-get.test.ts'
    'cli/src/__tests__/terminal-reset-sequences.test.ts'
    'cli/src/commands/__tests__/freebuff-command-aliases.test.ts'
    'cli/src/commands/ads.ts'
    'cli/src/components/__tests__/ad-banner.test.tsx'
    'cli/src/components/ad-banner.tsx'
    'cli/src/components/ask-user/__tests__/validation.test.ts'
    'cli/src/components/ask-user/utils/validation.ts'
    'cli/src/components/freebuff-active-session-summary.tsx'
    'cli/src/components/freebuff-landing-screen.tsx'
    'cli/src/components/freebuff-model-selector.tsx'
    'cli/src/components/freebuff-referral-banner.tsx'
    'cli/src/components/freebuff-superseded-screen.tsx'
    'cli/src/components/out-of-credits-banner.tsx'
    'cli/src/components/progress-bar.tsx'
    'cli/src/components/raised-pill.tsx'
    'cli/src/components/session-ended-banner.tsx'
    'cli/src/components/subscription-limit-banner.tsx'
    'cli/src/components/suggested-prompts.tsx'
    'cli/src/components/usage-banner.tsx'
    'cli/src/hooks/__tests__/holds-live-freebuff-slot.test.ts'
    'cli/src/hooks/__tests__/session-fetch-signal.test.ts'
    'cli/src/hooks/__tests__/use-activity-query.test.ts'
    'cli/src/hooks/__tests__/use-gravity-ad.test.ts'
    'cli/src/hooks/__tests__/use-usage-query.test.ts'
    'cli/src/hooks/__tests__/use-user-details-query.test.ts'
    'cli/src/hooks/use-activity-query.ts'
    'cli/src/hooks/use-fingerprint.ts'
    'cli/src/hooks/use-freebuff-ctrl-c-exit.ts'
    'cli/src/hooks/use-freebuff-session-progress.ts'
    'cli/src/hooks/use-freebuff-session.ts'
    'cli/src/hooks/use-freebuff-streak-query.ts'
    'cli/src/hooks/use-gravity-ad.ts'
    'cli/src/hooks/use-now.ts'
    'cli/src/hooks/use-subscription-query.ts'
    'cli/src/hooks/use-terminal-breakpoints.ts'
    'cli/src/hooks/use-update-preference.ts'
    'cli/src/hooks/use-usage-monitor.ts'
    'cli/src/hooks/use-usage-query.ts'
    'cli/src/hooks/use-user-details-query.ts'
    'cli/src/polyfills/bun-strip-ansi.ts'
    'cli/src/state/freebuff-model-store.ts'
    'cli/src/state/freebuff-session-store.ts'
    'cli/src/types/chat-state.ts'
    'cli/src/types/freebuff-session.ts'
    'cli/src/types/function-params.ts'
    'cli/src/utils/__tests__/error-handling.test.ts'
    'cli/src/utils/__tests__/fetch-usage.test.ts'
    'cli/src/utils/__tests__/freebuff-instance-owner.test.ts'
    'cli/src/utils/__tests__/freebuff-model-navigation.test.ts'
    'cli/src/utils/__tests__/freebuff-premium-reset.test.ts'
    'cli/src/utils/__tests__/freebuff-referral-cache.test.ts'
    'cli/src/utils/__tests__/freebuff-session-display.test.ts'
    'cli/src/utils/__tests__/freebuff-streak-line.test.ts'
    'cli/src/utils/__tests__/lazy-response-ads.test.ts'
    'cli/src/utils/__tests__/usage-banner-state.test.ts'
    'cli/src/utils/block-margins.ts'
    'cli/src/utils/engagement.ts'
    'cli/src/utils/error-handling.ts'
    'cli/src/utils/error-messages.ts'
    'cli/src/utils/fetch-usage.ts'
    'cli/src/utils/format-session-units.ts'
    'cli/src/utils/format-validation-errors-for-message.ts'
    'cli/src/utils/freebuff-agent-selection.ts'
    'cli/src/utils/freebuff-exit.ts'
    'cli/src/utils/freebuff-instance-owner.ts'
    'cli/src/utils/freebuff-model-navigation.ts'
    'cli/src/utils/freebuff-premium-reset.ts'
    'cli/src/utils/freebuff-referral-cache.ts'
    'cli/src/utils/freebuff-session-display.ts'
    'cli/src/utils/freebuff-streak-line.ts'
    'cli/src/utils/lazy-response-ads.ts'
    'cli/src/utils/response-ad-positions.ts'
    'cli/src/utils/subscription.ts'
    'cli/src/utils/syntax-highlighter.tsx'
    'cli/src/utils/time-format.ts'
    'cli/src/utils/usage-banner-state.ts'
    'common/src/__tests__/free-agents.test.ts'
    'common/src/__tests__/freebuff-models.test.ts'
    'common/src/__tests__/freebuff-referral-tiers.test.ts'
    'common/src/__tests__/response-ad-positions.test.ts'
    'common/src/constants/free-agents.ts'
    'common/src/constants/freebuff-gemini-thinker.ts'
    'common/src/constants/freebuff-models.ts'
    'common/src/constants/freebuff-referral-tiers.ts'
    'common/src/constants/hosts.ts'
    'common/src/reddit-capi.ts'
    'common/src/types/freebuff-session.ts'
    'common/src/types/freebuff-streak.ts'
    'common/src/util/__tests__/engagement-tracker.test.ts'
    'common/src/util/__tests__/freebuff-streak.test.ts'
    'common/src/util/__tests__/reddit-freebuff-retention.test.ts'
    'common/src/util/engagement-tracker.ts'
    'common/src/util/freebuff-privacy.ts'
    'common/src/util/freebuff-streak.ts'
    'common/src/util/lazy-response-ads.ts'
    'common/src/util/log-data.ts'
    'common/src/util/reddit-capi-events.ts'
    'common/src/util/reddit-freebuff-retention.ts'
    'common/src/util/response-ad-positions.ts'
    'packages/agent-runtime/src/__tests__/web-search-tool.test.ts'
    'scripts/cleanup-agent-gpt5-obsoleto.py'
    'scripts/cleanup-commercial-cli.py'
    'sdk/PUBLISHING.md'
    'sdk/scripts/release.js'
)

$deleted = 0
$missing = 0

function Remove-ObsoletePath {
    param([Parameter(Mandatory)][string]$RelativePath)

    $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $RelativePath))
    $rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

    if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Ruta rechazada por seguridad: $RelativePath"
    }

    if (-not (Test-Path -LiteralPath $candidate)) {
        $script:missing++
        return
    }

    if ($PSCmdlet.ShouldProcess($candidate, 'Eliminar elemento obsoleto')) {
        Remove-Item -LiteralPath $candidate -Recurse -Force
        $script:deleted++
        Write-Host "Eliminado: $RelativePath"
    }
}

foreach ($directory in $obsoleteDirectories) {
    Remove-ObsoletePath -RelativePath $directory
}

foreach ($file in $obsoleteFiles) {
    Remove-ObsoletePath -RelativePath $file
}

# Elimina solo directorios vacíos que hayan quedado dentro de las zonas auditadas.
$cleanupRoots = @('agents', 'assets', 'cli', 'common', 'scripts', 'sdk')
foreach ($cleanupRoot in $cleanupRoots) {
    $absoluteCleanupRoot = Join-Path $root $cleanupRoot
    if (-not (Test-Path -LiteralPath $absoluteCleanupRoot -PathType Container)) {
        continue
    }

    Get-ChildItem -LiteralPath $absoluteCleanupRoot -Directory -Recurse -Force |
        Sort-Object FullName -Descending |
        Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force | Select-Object -First 1) } |
        ForEach-Object {
            if ($PSCmdlet.ShouldProcess($_.FullName, 'Eliminar directorio vacío')) {
                Remove-Item -LiteralPath $_.FullName -Force
            }
        }
}

Write-Host ""
Write-Host "Limpieza terminada. Elementos eliminados: $deleted. Ya ausentes: $missing."
Write-Host "Este script no modifica package.json ni bun.lock; esos cambios vienen incluidos en el ZIP o parche actualizado."
