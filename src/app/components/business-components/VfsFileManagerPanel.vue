<script setup lang="ts">
export type VfsFileManagerMode = 'list' | 'reader' | 'editor' | 'slideshow'

export type VfsBrowserEntityKind = 'file' | 'directory'
export interface VfsBrowserEntity {
  path: string
  name: string
  kind: VfsBrowserEntityKind
}

const props = defineProps<{
  mode: VfsFileManagerMode
  currentPath: string
  entries: VfsBrowserEntity[]
  selectedPath: string | null
}>()

const emits = defineEmits<{
  selected: [path: string]
  opened: [path: string]
  upRequested: []
  createFileRequested: []
  createDirectoryRequested: []
}>()

function isSelected(path: string): boolean {
  return props.selectedPath === path
}

function select(path: string): void {
  emits('selected', path)
}

function open(entry: VfsBrowserEntity): void {
  if (entry.kind !== 'directory') return
  emits('opened', entry.path)
}
</script>

<template>
  <section class="vfs-file-manager-panel">
    <header class="vfs-fm-header">
      <div class="vfs-fm-path">
        <button type="button" class="vfs-fm-up" :disabled="currentPath === '/'" @click="emits('upRequested')">
          Up
        </button>
        <button type="button" class="menu_button vfs-fm-new" @click="emits('createDirectoryRequested')">新建目录</button>
        <button type="button" class="menu_button vfs-fm-new" @click="emits('createFileRequested')">新建文件</button>
        <span class="vfs-fm-path-text" :title="currentPath">{{ currentPath }}</span>
      </div>
      <div class="vfs-fm-actions">
        <slot name="actions" />
      </div>
    </header>

    <ul class="vfs-fm-list" data-testid="vfs-file-manager-list">
      <li v-for="entry in entries" :key="entry.path" class="vfs-fm-row" :data-selected="isSelected(entry.path)">
        <button type="button" class="vfs-fm-item" @click="select(entry.path)" @dblclick="open(entry)">
          <span class="vfs-fm-kind">{{ entry.kind === 'directory' ? '📁' : '📄' }}</span>
          <span class="vfs-fm-name">{{ entry.name }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.vfs-fm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.vfs-fm-path {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.vfs-fm-new {
  height: 28px;
  line-height: 28px;
  padding: 0 10px;
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

.vfs-fm-row[data-selected='true'] .vfs-fm-item {
  border-color: rgba(110, 168, 254, 0.8);
  background: rgba(110, 168, 254, 0.15);
}

.vfs-fm-kind {
  width: 22px;
  text-align: center;
}

.vfs-fm-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
