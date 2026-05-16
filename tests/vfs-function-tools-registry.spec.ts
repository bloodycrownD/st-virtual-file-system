import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ChatVfsCheckpointService } from '@/app/services/vfs-checkpoint/chat-vfs-checkpoint-service'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'
import type { FunctionToolDefinition } from '../../global'
import {
  registerVfsFunctionTools,
  shouldRegisterVfsTools,
  syncVfsFunctionToolRegistration,
  unregisterVfsFunctionTools,
} from '@/infra/sillytarvern/function-tools/vfs-function-tool-registry'
import { VFS_FUNCTION_TOOL_NAMES } from '@/infra/sillytarvern/function-tools/vfs-function-tool-schemas'

function createAdapterMock(): StContextAdapter {
  let ext: Record<string, unknown> = {}
  let chat: Record<string, unknown> = {}
  return {
    readExtensionRaw: () => ext,
    writeExtensionRaw: (raw) => {
      ext = raw
    },
    saveExtension: () => {},
    readChatRaw: () => chat,
    writeChatRaw: (raw) => {
      chat = raw
    },
    saveChat: () => {},
  }
}

function createRuntime(store = createVfsPersistenceStore(createAdapterMock())) {
  store.init()
  return new ChatVfsRuntime(
    store,
    new ToolDispatcher(),
    new ChatVfsCheckpointService(store, new DeflateContentCodec()),
  )
}

describe('vfs function tools registry', () => {
  const registerFunctionTool = vi.fn()
  const unregisterFunctionTool = vi.fn()
  const isToolCallingSupported = vi.fn(() => true)
  const canPerformToolCalls = vi.fn(() => true)
  let registered: FunctionToolDefinition[] = []

  beforeEach(() => {
    registered = []
    registerFunctionTool.mockImplementation((def: FunctionToolDefinition) => {
      registered.push(def)
    })
    unregisterFunctionTool.mockClear()
    registerFunctionTool.mockClear()
    isToolCallingSupported.mockReturnValue(true)
    canPerformToolCalls.mockReturnValue(true)
    vi.stubGlobal('SillyTavern', {
      getContext: () => ({
        registerFunctionTool,
        unregisterFunctionTool,
        isToolCallingSupported,
        canPerformToolCalls,
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('T-FC-01 registers seven vfs_* tools', () => {
    const runtime = createRuntime()
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    registerVfsFunctionTools(runtime, store)

    expect(registerFunctionTool).toHaveBeenCalledTimes(7)
    expect(registered.map((d) => d.name).sort()).toEqual([...VFS_FUNCTION_TOOL_NAMES].sort())
    for (const def of registered) {
      expect(def.stealth).toBe(false)
      expect(def.description.length).toBeGreaterThan(0)
      expect(typeof def.formatMessage).toBe('function')
    }
    expect(unregisterFunctionTool).toHaveBeenCalledTimes(7)
  })

  it('T-FC-02 shouldRegister is false when extension or virtual tools are off', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = createRuntime(store)

    registerVfsFunctionTools(runtime, store)
    const shouldRegister = registered[0]!.shouldRegister!

    expect(shouldRegister()).toBe(true)

    store.updateExtension((draft) => ({ ...draft, enabled: false }))
    expect(shouldRegister()).toBe(false)
    expect(shouldRegisterVfsTools(store)).toBe(false)

    store.updateExtension((draft) => ({
      ...draft,
      enabled: true,
      virtualToolCallEnabled: false,
    }))
    expect(shouldRegister()).toBe(false)
  })

  it('T-FC-03 shouldRegister is false when ST does not support tool calling', () => {
    isToolCallingSupported.mockReturnValue(false)
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    registerVfsFunctionTools(createRuntime(store), store)

    expect(registered[0]!.shouldRegister!()).toBe(false)
    expect(shouldRegisterVfsTools(store)).toBe(false)
  })

  it('T-FC-04 vfs_write action executes write via runtime and returns ok JSON', async () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = createRuntime(store)
    const executeSingleTool = vi.spyOn(runtime, 'executeSingleTool')

    registerVfsFunctionTools(runtime, store)
    const writeDef = registered.find((d) => d.name === 'vfs_write')!
    const out = await writeDef.action({ path: '/notes/a.txt', content: 'hello' })

    expect(executeSingleTool).toHaveBeenCalledWith('write', { path: '/notes/a.txt', content: 'hello' })
    const parsed = JSON.parse(out)
    expect(parsed.ok).toBe(true)
    expect(parsed.results[0].tool).toBe('write')
  })

  it('T-FC-05 action surfaces dispatcher errorCode on failure', async () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = createRuntime(store)
    vi.spyOn(runtime, 'executeSingleTool').mockReturnValue({
      ok: false,
      results: [{ tool: 'read', ok: false, summary: 'bad path', errorCode: 'TOOL_ERROR' }],
      errorCode: 'BATCH_FAILED',
      errorMessage: 'Tool threw',
    })

    registerVfsFunctionTools(runtime, store)
    const readDef = registered.find((d) => d.name === 'vfs_read')!
    const out = await readDef.action({ path: '/missing' })
    const parsed = JSON.parse(out)

    expect(parsed.ok).toBe(false)
    expect(parsed.errorCode).toBe('BATCH_FAILED')
    expect(parsed.results[0].errorCode).toBe('TOOL_ERROR')
  })

  it('T-FC-06 sync unregisters all tools when virtualToolCallEnabled turns off', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = createRuntime(store)

    registerVfsFunctionTools(runtime, store)
    unregisterFunctionTool.mockClear()

    store.updateExtension((draft) => ({ ...draft, virtualToolCallEnabled: false }))
    syncVfsFunctionToolRegistration(runtime, store)

    expect(unregisterFunctionTool).toHaveBeenCalledTimes(7)
    for (const name of VFS_FUNCTION_TOOL_NAMES) {
      expect(unregisterFunctionTool).toHaveBeenCalledWith(name)
    }
  })

  it('T-FC-07 vfs_read action matches direct executeBatch read content', async () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = createRuntime(store)

    runtime.executeBatch({
      calls: [{ tool: 'write', args: { path: '/notes/a.txt', content: 'hello' } }],
    })

    registerVfsFunctionTools(runtime, store)
    const readDef = registered.find((d) => d.name === 'vfs_read')!
    const fcOut = await readDef.action({ path: '/notes/a.txt' })
    const fcParsed = JSON.parse(fcOut)

    const direct = runtime.executeBatch({
      calls: [{ tool: 'read', args: { path: '/notes/a.txt' } }],
    })

    expect(fcParsed.ok).toBe(true)
    expect(direct.ok).toBe(true)
    expect(fcParsed.results[0].data.content).toBe(direct.results[0].data?.content)
    expect(fcParsed.results[0].data.content).toBe('hello')
  })

  it('unregisterVfsFunctionTools is idempotent', () => {
    unregisterVfsFunctionTools()
    unregisterVfsFunctionTools()
    expect(unregisterFunctionTool).toHaveBeenCalledTimes(14)
  })
})
