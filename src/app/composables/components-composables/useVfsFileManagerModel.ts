export type VfsEntityKind = 'file' | 'directory'

export interface VfsManagerEntity {
  id: string
  name: string
  kind: VfsEntityKind
  path: string
}

export type VfsEntityAction = 'toggle-status' | 'delete' | 'view' | 'edit' | 'rename' | 'apply-strategy' | 'open-slideshow'
export type VfsGlobalAction = 'create-file' | 'create-directory'

const FILE_ACTIONS: VfsEntityAction[] = ['toggle-status', 'delete', 'view', 'edit', 'rename']
const DIRECTORY_ACTIONS: VfsEntityAction[] = ['toggle-status', 'delete', 'rename', 'apply-strategy', 'open-slideshow']

export function getVisibleActions(entity: VfsManagerEntity | null): VfsEntityAction[] {
  if (!entity) return []
  return entity.kind === 'file' ? FILE_ACTIONS : DIRECTORY_ACTIONS
}

export function isActionTriggerable(entity: VfsManagerEntity | null, action: VfsEntityAction): boolean {
  return getVisibleActions(entity).includes(action)
}
