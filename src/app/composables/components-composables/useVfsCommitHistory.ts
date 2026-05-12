import { computed, ref } from 'vue'

/** Editor-side snapshot list rows (derived from `chatVfsSnapshots` filtered to the active path). */
export interface VfsCommitHistoryRecord {
  snapshotId: string
  time: string
  operator: string
  actionType: string
  scope: string
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
