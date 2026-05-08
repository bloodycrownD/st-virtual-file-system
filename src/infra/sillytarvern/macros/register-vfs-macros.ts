/**
 * @file Registers SillyTavern prompt macros for chat VFS introspection.
 *
 * Handlers are **synchronous** (ST does not await Promise returns). They read the latest state from
 * `vfsPersistenceStore`, which must already be initialized when this runs from `main.ts`.
 */
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { renderVirtualFileTree } from '@/domain/work-tree/virtual-file-tree-render'
import { renderVirtualWorkTree } from '@/domain/work-tree/work-tree-engine'

export function registerVfsMacros(store: VfsPersistenceStore): void {
  if (typeof SillyTavern === 'undefined') {
    return
  }
  const { registerMacro } = SillyTavern.getContext()

  registerMacro('VIRTUAL_FILE_TREE', () => {
    const snapshot = store.getState().chat.chatVfsSnapshot
    return renderVirtualFileTree(snapshot)
  })

  registerMacro('VIRTUAL_WORK_TREE', () => {
    const { chatVfsSnapshot, workTree } = store.getState().chat
    return renderVirtualWorkTree(chatVfsSnapshot, workTree)
  })
}
