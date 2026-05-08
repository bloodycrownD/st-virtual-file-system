import { computed, ref } from 'vue'

export type VfsCommitActionType = 'save' | 'rollback' | 'batch-rollback' | 'trace-rollback'

export interface VfsCommitHistoryRecord {
  time: string
  operator: string
  actionType: VfsCommitActionType
  scope: string
  sourceVersionId?: string
}

export function createVfsCommitHistoryStore() {
  const recordsRef = ref<VfsCommitHistoryRecord[]>([])

  const appendRecord = (record: VfsCommitHistoryRecord): void => {
    recordsRef.value = [...recordsRef.value, record].sort(
      (left, right) => new Date(right.time).getTime() - new Date(left.time).getTime(),
    )
  }

  return {
    records: computed(() => recordsRef.value),
    appendRecord,
  }
}
