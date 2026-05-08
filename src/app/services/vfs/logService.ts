import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

export interface FetchLogsInput {
  page: number
  pageSize: number
}

export interface FetchLogsOutput {
  items: unknown[]
  total: number
}

export async function fetchLogs({ page, pageSize }: FetchLogsInput): Promise<FetchLogsOutput> {
  const logs = vfsPersistenceStore.getState().chat.chatVfsLogs
  const start = Math.max(page - 1, 0) * pageSize
  return {
    items: logs.slice(start, start + pageSize),
    total: logs.length,
  }
}
