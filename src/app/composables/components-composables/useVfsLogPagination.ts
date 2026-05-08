const PAGE_SIZE = 20

export interface VfsLogPaginationState<T> {
  pageSize: number
  currentPage: number
  totalPages: number
  currentItems: T[]
  goToPage: (page: number) => void
}

export function createVfsLogPagination<T>(items: T[]): VfsLogPaginationState<T> {
  let currentPage = 1

  const getTotalPages = (): number => Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const clampPage = (page: number): number => Math.min(Math.max(page, 1), getTotalPages())

  const api: VfsLogPaginationState<T> = {
    pageSize: PAGE_SIZE,
    get currentPage() {
      return currentPage
    },
    get totalPages() {
      return getTotalPages()
    },
    get currentItems() {
      const start = (currentPage - 1) * PAGE_SIZE
      return items.slice(start, start + PAGE_SIZE)
    },
    goToPage(page: number) {
      // WHY: boundary clamp prevents empty pages after manual page input.
      currentPage = clampPage(page)
    },
  }

  return api
}

export interface VfsServerPaginationInput {
  currentPage: number
  totalItems: number
  pageSize?: number
}

export interface VfsServerPaginationState {
  pageSize: number
  currentPage: number
  totalItems: number
  totalPages: number
  goToPage: (page: number) => void
}

/**
 * Server-driven pagination model.
 *
 * Use when `items` is already a server-sliced page and `totalItems` represents
 * the global collection size (so we must not re-slice locally).
 */
export function createVfsServerLogPagination({
  currentPage: initialPage,
  totalItems,
  pageSize = PAGE_SIZE,
}: VfsServerPaginationInput): VfsServerPaginationState {
  let currentPage = initialPage
  const getTotalPages = (): number => Math.max(1, Math.ceil(Math.max(totalItems, 0) / pageSize))
  const clampPage = (page: number): number => Math.min(Math.max(page, 1), getTotalPages())

  return {
    pageSize,
    get currentPage() {
      return currentPage
    },
    get totalItems() {
      return totalItems
    },
    get totalPages() {
      return getTotalPages()
    },
    goToPage(page: number) {
      currentPage = clampPage(page)
    },
  }
}
