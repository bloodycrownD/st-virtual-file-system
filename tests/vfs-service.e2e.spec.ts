import { describe, expect, it } from 'vitest'
import { createVfsService } from '@/app/services/vfs/vfs-service-factory'
import { InMemoryVfsSnapshotRepository } from '@/infra/repository/in-memory-vfs-snapshot-repository'

describe('vfs service e2e', () => {
  it('runs create/write/read/rename/move/list/export/import flow', async () => {
    const repository = new InMemoryVfsSnapshotRepository()
    const service = createVfsService({
      repository,
      compressionThreshold: 8,
    })

    service.mkdir('/notes')
    service.writeFile('/notes/todo.txt', 'todo content')
    service.rename('/notes/todo.txt', 'today.txt')
    service.move('/notes/today.txt', '/today.txt')

    expect(service.readFile('/today.txt')).toBe('todo content')
    expect(service.list('/').map((item) => item.name)).toContain('today.txt')

    await service.save()
    const snapshot = service.exportSnapshot()

    const restored = createVfsService({
      repository: new InMemoryVfsSnapshotRepository(snapshot),
      compressionThreshold: 8,
    })
    await restored.load()
    expect(restored.readFile('/today.txt')).toBe('todo content')
  })
})
