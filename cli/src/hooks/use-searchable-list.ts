import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

interface SearchableItem {
  id: string
  label: string
}

export interface UseSearchableListOptions<T extends SearchableItem> {
  /** Items to filter */
  items: T[]
  /** Key that triggers reset of search and focus (e.g., currentPath) */
  resetKey?: string
  /** Custom filter function (defaults to case-insensitive label matching) */
  filterFn?: (item: T, query: string) => boolean
  /** Filter queries beginning with / or ~ instead of treating them as paths. */
  filterPathQueries?: boolean
}

export interface UseSearchableListReturn<T extends SearchableItem> {
  /** Current search query */
  searchQuery: string
  /** Set the search query */
  setSearchQuery: (query: string) => void
  /** Currently focused item index */
  focusedIndex: number
  /** Set the focused index */
  setFocusedIndex: Dispatch<SetStateAction<number>>
  /** Filtered items based on search query */
  filteredItems: T[]
  /** Handle focus change from hover */
  handleFocusChange: (index: number) => void
}

export function filterSearchableItems<T extends SearchableItem>(
  items: T[],
  query: string,
  filterFunction: (item: T, query: string) => boolean,
  filterPathQueries: boolean = false,
): T[] {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return items
  if (
    !filterPathQueries &&
    (trimmedQuery.startsWith('/') || trimmedQuery.startsWith('~'))
  ) {
    return items
  }
  return items.filter(
    (item) => item.label === '..' || filterFunction(item, trimmedQuery),
  )
}

/**
 * Hook for managing searchable list state.
 * Handles search filtering, focus management, and automatic index clamping.
 */
export function useSearchableList<T extends SearchableItem>({
  items,
  resetKey,
  filterFn,
  filterPathQueries = false,
}: UseSearchableListOptions<T>): UseSearchableListReturn<T> {
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Default filter function: case-insensitive label matching
  const defaultFilterFn = useCallback(
    (item: T, query: string) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    [],
  )

  const filterFunction = filterFn ?? defaultFilterFn

  const filteredItems = useMemo(
    () =>
      filterSearchableItems(
        items,
        searchQuery,
        filterFunction,
        filterPathQueries,
      ),
    [filterFunction, filterPathQueries, items, searchQuery],
  )

  // Reset focus when resetKey changes (but keep search query)
  useEffect(() => {
    setFocusedIndex(0)
  }, [resetKey])

  // Clamp focused index when filtered list changes
  useEffect(() => {
    if (focusedIndex >= filteredItems.length) {
      setFocusedIndex(Math.max(0, filteredItems.length - 1))
    }
  }, [filteredItems.length, focusedIndex])

  // Handle focus change from hover
  const handleFocusChange = useCallback((index: number) => {
    setFocusedIndex(index)
  }, [])

  return {
    searchQuery,
    setSearchQuery,
    focusedIndex,
    setFocusedIndex,
    filteredItems,
    handleFocusChange,
  }
}
