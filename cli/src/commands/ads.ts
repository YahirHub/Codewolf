import { IS_FREEBUFF } from '../utils/constants'

/**
 * Codewolf never enables commercial ads. The Freebuff build keeps its
 * independent ad behavior for compatibility with that separate product mode.
 */
export const getAdsEnabled = (): boolean => IS_FREEBUFF
