import fs from 'fs'
import os from 'os'

import open from 'open'
import { isWsl, powerShellPathFromWsl } from 'wsl-utils'

import { getCliEnv } from './env'
import { logger } from './logger'

/**
 * Safely open a URL in the user's default browser.
 *
 * On headless Linux (no DISPLAY or WAYLAND_DISPLAY), calling `open()` spawns
 * `xdg-open` which can crash the entire process — even inside a try/catch —
 * because the child process may trigger fatal signals. This wrapper detects
 * headless environments and skips the call entirely. WSL is exempt: there
 * `open()` goes through powershell.exe, which needs no display.
 *
 * On WSL, `open()` spawns powershell.exe from the Windows mount. If Windows
 * interop is disabled (no access to /mnt/c), that spawn fails with ENOENT.
 * Under Bun the failure is delivered before the `open()` promise resolves and
 * cannot be caught from here — not by try/catch, and not by an 'error'
 * listener attached afterward — so the only reliable defense is checking that
 * powershell.exe exists before calling `open()`. `wsl-utils` is what `open`
 * itself uses to build the path, so the check matches its behavior exactly.
 *
 * @returns `true` if the browser was (likely) opened, `false` if skipped.
 */
export async function safeOpen(url: string): Promise<boolean> {
  if (isWsl) {
    const powershellPath = await powerShellPathFromWsl()
    if (!fs.existsSync(powershellPath)) {
      logger.warn(
        { powershellPath },
        'Se detectó WSL, pero powershell.exe no está disponible (¿interoperabilidad con Windows desactivada?). No se abrirá el navegador.',
      )
      return false
    }
  } else if (os.platform() === 'linux') {
    const env = getCliEnv()
    const hasDisplay = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY)
    if (!hasDisplay) {
      logger.warn(
        'No se detectó un servidor gráfico (DISPLAY o WAYLAND_DISPLAY no definidos). No se abrirá el navegador.',
      )
      return false
    }
  }

  try {
    const subprocess = await open(url)
    // With the default `wait: false`, spawn failures can surface on the
    // child's 'error' event after the promise resolves; without a listener
    // they become uncaught exceptions that kill the process.
    subprocess.once('error', (err) => {
      logger.error(err, 'No se pudo abrir el navegador')
    })
    return true
  } catch (err) {
    logger.error(err, 'No se pudo abrir el navegador')
    return false
  }
}
