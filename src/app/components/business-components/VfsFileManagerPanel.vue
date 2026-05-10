<!--
  Lists directory entries and delegates per-row actions via `entity-action-requested`.
  Does not implement list selection/highlight; preview/editor targets live in `VfsMainScreen`.
-->
<script setup lang="ts">
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import type { VfsEntityAction, VfsManagerEntity } from '@/app/composables/components-composables/useVfsFileManagerModel'

export type VfsFileManagerMode = 'list' | 'reader' | 'editor' | 'slideshow'

export type VfsBrowserEntityKind = 'file' | 'directory'
export interface VfsBrowserEntity {
  path: string
  name: string
  kind: VfsBrowserEntityKind
  enabled?: boolean
}

defineProps<{
  mode: VfsFileManagerMode
  currentPath: string
  entries: VfsBrowserEntity[]
}>()

const emits = defineEmits<{
  opened: [path: string]
  upRequested: []
  entityActionRequested: [payload: { entity: VfsManagerEntity; action: VfsEntityAction }]
}>()

// Intent: centralize toolbar icon mapping so semantics/styles stay consistent across the header.
const HEADER_ICON = {
  fileManager: 'fa-solid fa-folder-tree',
  up: 'fa-solid fa-arrow-up',
} as const

function open(entry: VfsBrowserEntity): void {
  if (entry.kind !== 'directory') return
  emits('opened', entry.path)
}

function toManagerEntity(entry: VfsBrowserEntity): VfsManagerEntity {
  return {
    id: entry.path,
    name: entry.name,
    kind: entry.kind,
    path: entry.path,
  }
}
</script>

<template>
  <section class="vfs-file-manager-panel">
    <header class="vfs-fm-header">
      <!-- Intent: keep navigation semantics grouped on the left; actions are rendered separately on the right. -->
      <div class="vfs-fm-nav-group">
        <span class="vfs-fm-icon-button vfs-fm-tag" role="img" title="文件管理" aria-label="文件管理">
          <i :class="HEADER_ICON.fileManager" aria-hidden="true"></i>
        </span>
        <button
          type="button"
          class="vfs-fm-icon-button vfs-fm-up"
          :disabled="currentPath === '/'"
          title="返回上级"
          aria-label="返回上级"
          @click="emits('upRequested')"
        >
          <i :class="HEADER_ICON.up" aria-hidden="true"></i>
        </button>
        <span class="vfs-fm-path-text" :title="currentPath">{{ currentPath }}</span>
      </div>
      <div class="vfs-fm-action-group">
        <slot name="actions" />
      </div>
    </header>

    <ul class="vfs-fm-list" data-testid="vfs-file-manager-list">
      <li v-for="entry in entries" :key="entry.path" class="vfs-fm-row" :data-path="entry.path">
        <!-- Intent: directory navigation remains on double-click; row body does not imply list selection. -->
        <button type="button" class="vfs-fm-item" @dblclick="open(entry)">
          <span class="vfs-fm-kind">{{ entry.kind === 'directory' ? '📁' : '📄' }}</span>
          <span class="vfs-fm-name">{{ entry.name }}</span>
        </button>
        <div class="vfs-fm-row-actions" @click.stop>
          <!-- WHY: fixed status slot keeps kebab hit area stable across state toggles. -->
          <span
            class="vfs-fm-row-status"
            role="img"
            data-testid="vfs-fm-row-status"
            :title="entry.enabled === false ? '已禁用' : '已启用'"
            :aria-label="entry.enabled === false ? '状态：已禁用' : '状态：已启用'"
          >
            <i :class="entry.enabled === false ? 'fa-solid fa-toggle-off' : 'fa-solid fa-toggle-on'" aria-hidden="true" />
          </span>
          <VfsActionMenu
            :entity="toManagerEntity(entry)"
            mode="entity-actions"
            @action-selected="(action) => emits('entityActionRequested', { entity: toManagerEntity(entry), action })"
          />
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.vfs-file-manager-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}

.vfs-fm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  flex: 0 0 auto;
}

.vfs-fm-nav-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.vfs-fm-action-group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
}

.vfs-fm-icon-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  padding: 0;
  flex: 0 0 auto;
}

.vfs-fm-icon-button i {
  font-size: 14px;
  line-height: 1;
}

.vfs-fm-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vfs-fm-tag {
  pointer-events: none;
}

.vfs-fm-path-text {
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.vfs-fm-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.vfs-fm-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.vfs-fm-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.18);
}

.vfs-fm-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  flex: 0 0 auto;
  position: relative;
  z-index: 2;
}

.vfs-fm-row-status {
  width: 28px;
  min-width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.2);
  opacity: 0.95;
}

.vfs-fm-kind {
  width: 22px;
  text-align: center;
}

.vfs-fm-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
