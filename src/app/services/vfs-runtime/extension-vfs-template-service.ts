import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'

export class ExtensionVfsTemplateService {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly versionService: ChatVfsVersionService,
  ) {}

  initializeChatFromTemplateIfNeeded(): void {
    const state = this.store.getState()
    if (state.chat.templateInitialized) return
    if (!state.extension.extensionTemplateVfsSnapshot) {
      this.store.updateChat((draft) => ({ ...draft, templateInitialized: true }))
      return
    }
    this.store.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: state.extension.extensionTemplateVfsSnapshot,
      templateInitialized: true,
    }))
  }

  overwriteChatWithTemplate(): void {
    const state = this.store.getState()
    if (!state.extension.extensionTemplateVfsSnapshot) return
    this.versionService.commitSystem('pre-template-overwrite', ['*'])
    this.store.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: state.extension.extensionTemplateVfsSnapshot,
      templateInitialized: true,
    }))
  }
}
