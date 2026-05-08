import { computed, ref } from 'vue'

export type VfsCommitActionType = 'save' | 'rollback' | 'batch-rollback' | 'trace-rollback'

export interface VfsCommitHistoryRecord {
  commitId?: string
  time: string
  operator: string
  actionType: VfsCommitActionType
  scope: string
  sourceVersionId?: string
}

export function createVfsCommitHistoryStore() {
  const recordsRef = ref<VfsCommitHistoryRecord[]>([])
  const byDescTime = (left: VfsCommitHistoryRecord, right: VfsCommitHistoryRecord) =>
    new Date(right.time).getTime() - new Date(left.time).getTime()

  const appendRecord = (record: VfsCommitHistoryRecord): void => {
    recordsRef.value = [...recordsRef.value, record].sort(byDescTime)
  }

  const replaceRecords = (records: VfsCommitHistoryRecord[]): void => {
    recordsRef.value = [...records].sort(byDescTime)
  }

  return {
    records: computed(() => recordsRef.value),
    appendRecord,
    replaceRecords,
  }
}
