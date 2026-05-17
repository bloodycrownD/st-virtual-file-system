/**
 * @file SillyTavern Function Calling registration for chat-scoped VFS virtual tools.
 *
 * Maps `vfs_*` ST tool names to short dispatcher names and executes via `ChatVfsRuntime`
 * without message `logContext` (no `chatVfsLogs` rows for FC invocations).
 */
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { formatFunctionToolResult } from '@/infra/sillytarvern/function-tools/format-function-tool-result'
import {
  VFS_FUNCTION_TOOL_NAMES,
  VFS_FUNCTION_TOOL_SCHEMAS,
} from '@/infra/sillytarvern/function-tools/vfs-function-tool-schemas'

const VFS_TO_SHORT = Object.fromEntries(
  VFS_FUNCTION_TOOL_SCHEMAS.map((s) => [s.name, s.shortTool]),
) as Record<string, string>

/**
 * Gate for `shouldRegister` and `syncVfsFunctionToolRegistration`.
 * Requires extension + virtual-tool toggles and ST Function Calling support.
 */
export function shouldRegisterVfsTools(store: VfsPersistenceStore): boolean {
  if (typeof SillyTavern === 'undefined') {
    return false
  }
  const ctx = SillyTavern.getContext()
  if (!ctx.registerFunctionTool || !ctx.isToolCallingSupported?.()) {
    return false
  }
  const ext = store.getState().extension
  if (!ext.enabled || !ext.virtualToolCallEnabled) {
    return false
  }
  if (ctx.canPerformToolCalls && !ctx.canPerformToolCalls('normal')) {
    return false
  }
  return true
}

function createToolAction(runtime: ChatVfsRuntime, store: VfsPersistenceStore, vfsName: string) {
  const shortTool = VFS_TO_SHORT[vfsName]
  return async (args: Record<string, unknown>): Promise<string> => {
    // Defense in depth: ST should not invoke when gated off, but block if unregister lagged.
    if (!shouldRegisterVfsTools(store)) {
      return formatFunctionToolResult(
        {
          ok: false,
          results: [],
          errorCode: 'VFS_TOOLS_DISABLED',
          errorMessage:
            'VFS function tools are unavailable (extension off, virtual tools off, or ST function calling unsupported).',
        },
        { calls: [{ tool: shortTool, args: args ?? {} }] },
      )
    }
    const callInput = { tool: shortTool, args: args ?? {} }
    try {
      const batch = runtime.executeSingleTool(shortTool, callInput.args)
      return formatFunctionToolResult(batch, { calls: [callInput] })
    } catch (err) {
      return formatFunctionToolResult(
        {
          ok: false,
          results: [],
          errorCode: 'TOOL_EXECUTION_FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
        { calls: [callInput] },
      )
    }
  }
}

/**
 * Register all `vfs_*` tools with SillyTavern (no-op when API missing).
 * Unregisters each name first for idempotent hot-reload safety.
 */
export function registerVfsFunctionTools(runtime: ChatVfsRuntime, store: VfsPersistenceStore): void {
  if (typeof SillyTavern === 'undefined') {
    return
  }
  const ctx = SillyTavern.getContext()
  if (!ctx.registerFunctionTool) {
    return
  }

  for (const schema of VFS_FUNCTION_TOOL_SCHEMAS) {
    ctx.unregisterFunctionTool?.(schema.name)
    ctx.registerFunctionTool({
      name: schema.name,
      displayName: schema.displayName,
      description: schema.description,
      parameters: schema.parameters,
      formatMessage: schema.formatMessage,
      stealth: false,
      shouldRegister: () => shouldRegisterVfsTools(store),
      action: createToolAction(runtime, store, schema.name),
    })
  }
}

/** Idempotent cleanup: unregister all `vfs_*` names from ST (safe on unload / toggle-off). */
export function unregisterVfsFunctionTools(): void {
  if (typeof SillyTavern === 'undefined') {
    return
  }
  const ctx = SillyTavern.getContext()
  if (!ctx.unregisterFunctionTool) {
    return
  }
  for (const name of VFS_FUNCTION_TOOL_NAMES) {
    ctx.unregisterFunctionTool(name)
  }
}

/**
 * Reconcile ST registration with current store + ST capability flags.
 * Unregisters when gated off; otherwise re-registers (unregister-then-register inside).
 */
export function syncVfsFunctionToolRegistration(
  runtime: ChatVfsRuntime,
  store: VfsPersistenceStore,
): void {
  if (shouldRegisterVfsTools(store)) {
    registerVfsFunctionTools(runtime, store)
  } else {
    unregisterVfsFunctionTools()
  }
}

/** Tracks last gate so chat/log store updates do not re-register tools on every notify. */
let lastRegistrationGate: boolean | null = null

/**
 * Initial sync + subscribe only when extension/ST gate flips.
 * Chat-scoped mutations (snapshot, logs) must not unregister/register repeatedly.
 */
export function subscribeVfsFunctionToolGateSync(
  runtime: ChatVfsRuntime,
  store: VfsPersistenceStore,
): () => void {
  lastRegistrationGate = shouldRegisterVfsTools(store)
  if (lastRegistrationGate) {
    registerVfsFunctionTools(runtime, store)
  } else {
    unregisterVfsFunctionTools()
  }

  return store.subscribe(() => {
    const gate = shouldRegisterVfsTools(store)
    if (gate === lastRegistrationGate) {
      return
    }
    lastRegistrationGate = gate
    if (gate) {
      registerVfsFunctionTools(runtime, store)
    } else {
      unregisterVfsFunctionTools()
    }
  })
}
