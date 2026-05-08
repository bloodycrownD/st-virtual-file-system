export const VFS_LOG_REFRESH_REQUESTED = 'VFS_LOG_REFRESH_REQUESTED'
export const VFS_LOG_REFRESH_AUTO = 'VFS_LOG_REFRESH_AUTO'
export const VFS_STATE_REFRESH_REQUIRED = 'VFS_STATE_REFRESH_REQUIRED'
export const VFS_POPUP_OPENED = 'VFS_POPUP_OPENED'
export const VFS_POPUP_CLOSED = 'VFS_POPUP_CLOSED'

export function emitVfsEvent(eventName: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(eventName))
}

export function useVfsMessageHooks(): () => void {
  let queued = false
  const handler = () => {
    // WHY: SillyTavern can emit multiple closely-timed message events; we coalesce them so the UI
    // observes exactly one refresh request per tick.
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      // WHY: messages should trigger exactly one refresh path; the UI listens to the VFS_LOG_REFRESH_AUTO event.
      emitVfsEvent(VFS_LOG_REFRESH_AUTO)
    })
  }

  if (typeof SillyTavern !== 'undefined') {
    const { eventSource, event_types: eventTypes } = SillyTavern.getContext()
    eventSource.on(eventTypes.MESSAGE_RECEIVED, handler)
    eventSource.on(eventTypes.MESSAGE_EDITED, handler)
  }

  return () => {
    if (typeof SillyTavern === 'undefined') return
    const { eventSource, event_types: eventTypes } = SillyTavern.getContext()
    eventSource.removeListener(eventTypes.MESSAGE_RECEIVED, handler)
    eventSource.removeListener(eventTypes.MESSAGE_EDITED, handler)
  }
}
