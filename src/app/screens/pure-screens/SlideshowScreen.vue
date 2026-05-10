<script setup lang="ts">
import { computed } from 'vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'

export interface SlideshowPage {
  path: string
  title: string
  content: string
}

const props = defineProps<{
  pages: SlideshowPage[]
  pageIndex: number
}>()
// Intent: clamp external page index so shell controls can reset/step safely without content component branching.
const currentPage = computed(() => props.pages[Math.max(0, Math.min(props.pageIndex, props.pages.length - 1))] ?? null)
</script>

<template>
  <section class="vfs-slideshow-screen">
    <article class="vfs-slide-content" data-testid="vfs-slide-content">
      <template v-if="pages.length === 0">
        <p class="vfs-slide-empty">No readable pages in this directory.</p>
      </template>
      <template v-else>
        <section v-if="currentPage" class="vfs-slide-one">
          <h3 class="vfs-slide-title">{{ currentPage.title }}</h3>
          <ReaderScreen :html="currentPage.content" />
        </section>
      </template>
    </article>
  </section>
</template>

<style scoped>
.vfs-slide-content {
  display: grid;
  gap: 16px;
}

.vfs-slide-title {
  margin: 0 0 8px;
  opacity: 0.92;
  text-align: center;
}

.vfs-slide-empty {
  margin: 0;
  opacity: 0.75;
}
</style>
