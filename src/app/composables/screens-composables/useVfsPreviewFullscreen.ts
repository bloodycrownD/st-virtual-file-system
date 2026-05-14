import { onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'

type DocumentWithVendorFullscreen = Document & {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
}

type ElementWithVendorFullscreen = HTMLElement & {
  webkitRequestFullscreen?: (allowFullscreen?: boolean) => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

const FULLSCREEN_CHANGE_EVENTS = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange',
] as const

/** Read the active fullscreen element across vendor-prefixed implementations. */
export function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null
  const doc = document as DocumentWithVendorFullscreen
  return (
    document.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  )
}

function exitFullscreenFromDocument(): Promise<void> {
  const doc = document as DocumentWithVendorFullscreen
  const run =
    typeof document.exitFullscreen === 'function'
      ? () => document.exitFullscreen()
      : typeof doc.webkitExitFullscreen === 'function'
        ? () => doc.webkitExitFullscreen!()
        : typeof doc.mozCancelFullScreen === 'function'
          ? () => doc.mozCancelFullScreen!()
          : typeof doc.msExitFullscreen === 'function'
            ? () => doc.msExitFullscreen!()
            : null
  if (!run) return Promise.resolve()
  return Promise.resolve(run()).catch(() => undefined)
}

/**
 * Best-effort exit when the fullscreen node lives inside `container` (e.g. `#st-vfs-popup`).
 * WHY: avoids a detached fullscreen layer after popup teardown without coupling to preview internals.
 */
export function exitFullscreenIfContainedBy(container: Element | null): void {
  if (!container) return
  const fs = getFullscreenElement()
  if (!fs || !container.contains(fs)) return
  void exitFullscreenFromDocument()
}

export function getRequestFullscreenForElement(el: HTMLElement): (() => Promise<void>) | null {
  const node = el as ElementWithVendorFullscreen
  if (typeof node.requestFullscreen === 'function') {
    const fn = node.requestFullscreen.bind(node)
    return () => Promise.resolve(fn()).then(() => undefined)
  }
  if (typeof node.webkitRequestFullscreen === 'function') {
    const fn = node.webkitRequestFullscreen.bind(node)
    return () => Promise.resolve(fn()).then(() => undefined)
  }
  if (typeof node.mozRequestFullScreen === 'function') {
    const fn = node.mozRequestFullScreen.bind(node)
    return () => Promise.resolve(fn()).then(() => undefined)
  }
  if (typeof node.msRequestFullscreen === 'function') {
    const fn = node.msRequestFullscreen.bind(node)
    return () => Promise.resolve(fn()).then(() => undefined)
  }
  return null
}

function isPreviewSubtreeFullscreen(previewRoot: HTMLElement | null): boolean {
  if (!previewRoot) return false
  const fs = getFullscreenElement()
  if (!fs) return false
  return previewRoot === fs || previewRoot.contains(fs)
}

/**
 * Preview-stack fullscreen: enter/exit on `section.vfs-preview-body` only (not `#st-vfs-popup-app`).
 * WHY: `fullscreenchange` keeps UI in sync when the browser exits fullscreen via OS gesture or ESC.
 */
export function useVfsPreviewFullscreen(previewBodyRef: Ref<HTMLElement | null>) {
  const isActive = ref(false)
  const isSupported = ref(false)

  function syncFromDocument(): void {
    isActive.value = isPreviewSubtreeFullscreen(previewBodyRef.value)
  }

  function refreshSupportFlag(): void {
    const el = previewBodyRef.value
    isSupported.value = Boolean(el && getRequestFullscreenForElement(el))
  }

  watch(
    previewBodyRef,
    () => {
      refreshSupportFlag()
      syncFromDocument()
    },
    { immediate: true },
  )

  let listening = false
  function startListening(): void {
    if (listening || typeof document === 'undefined') return
    listening = true
    for (const ev of FULLSCREEN_CHANGE_EVENTS) {
      document.addEventListener(ev, syncFromDocument)
    }
  }

  function stopListening(): void {
    if (!listening) return
    listening = false
    for (const ev of FULLSCREEN_CHANGE_EVENTS) {
      document.removeEventListener(ev, syncFromDocument)
    }
  }

  onMounted(() => {
    startListening()
    refreshSupportFlag()
    syncFromDocument()
  })

  onBeforeUnmount(() => {
    // WHY: unmounting while an element inside our preview subtree is fullscreen leaves a blank fullscreen layer.
    if (isPreviewSubtreeFullscreen(previewBodyRef.value)) {
      void exitFullscreenFromDocument()
    }
    stopListening()
  })

  async function enter(): Promise<void> {
    const el = previewBodyRef.value
    if (!el) return
    const request = getRequestFullscreenForElement(el)
    if (!request) {
      toastr.error('当前环境不支持全屏')
      return
    }
    try {
      await request()
    } catch {
      toastr.error('无法进入全屏')
    }
  }

  async function exit(): Promise<void> {
    if (!isPreviewSubtreeFullscreen(previewBodyRef.value)) return
    try {
      await exitFullscreenFromDocument()
    } catch {
      toastr.error('无法退出全屏')
    }
  }

  async function toggle(): Promise<void> {
    if (isActive.value) await exit()
    else await enter()
  }

  return reactive({
    isActive,
    isSupported,
    enter,
    exit,
    toggle,
    /** Test hook: re-read `document.fullscreenElement` after mocks mutate it without firing events. */
    syncFromDocument,
  })
}
