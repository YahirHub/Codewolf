import { getCodewolfHomeDir } from '@codebuff/common/util/codewolf-home'

/**
 * Resolve Codewolf's single on-disk user data directory.
 *
 * Development and compiled binaries deliberately share the same path:
 *   Windows: C:\\Users\\<user>\\.codewolf
 *   Linux:   /home/<user>/.codewolf
 *   macOS:   /Users/<user>/.codewolf
 */
export const getConfigDir = (): string => getCodewolfHomeDir()
