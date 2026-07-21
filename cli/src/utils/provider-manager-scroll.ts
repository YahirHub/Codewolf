export type ProviderManagerRowType = 'provider' | 'add' | 'close'

export interface ProviderManagerRowBounds {
  top: number
  height: number
}

const PROVIDER_ROW_HEIGHT = 4
const ACTION_ROW_HEIGHT = 3

function getRowHeight(type: ProviderManagerRowType): number {
  return type === 'provider' ? PROVIDER_ROW_HEIGHT : ACTION_ROW_HEIGHT
}

export function getProviderManagerRowBounds(
  rows: ReadonlyArray<{ type: ProviderManagerRowType }>,
  selectedIndex: number,
): ProviderManagerRowBounds | null {
  if (selectedIndex < 0 || selectedIndex >= rows.length) return null

  let top = 0
  for (let index = 0; index < selectedIndex; index += 1) {
    const row = rows[index]
    if (row) top += getRowHeight(row.type)
  }

  const selectedRow = rows[selectedIndex]
  if (!selectedRow) return null

  return {
    top,
    height: getRowHeight(selectedRow.type),
  }
}

export function getProviderManagerScrollTop(
  currentScrollTop: number,
  viewportHeight: number,
  bounds: ProviderManagerRowBounds,
): number {
  if (viewportHeight <= 0) return currentScrollTop
  if (bounds.top < currentScrollTop) return bounds.top

  const bottom = bounds.top + bounds.height
  if (bottom > currentScrollTop + viewportHeight) {
    return Math.max(0, bottom - viewportHeight)
  }

  return currentScrollTop
}
