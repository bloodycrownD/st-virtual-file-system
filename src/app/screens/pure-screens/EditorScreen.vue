<script setup lang="ts">
import { ref } from 'vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'

const model = defineModel<string>({ required: true })
const previewMode = ref(false)
</script>

<template>
  <section class="vfs-editor-screen">
    <header class="vfs-editor-toolbar">
      <button type="button" @click="previewMode = !previewMode">
        {{ previewMode ? 'Source' : 'Preview' }}
      </button>
    </header>
    <textarea v-if="!previewMode" v-model="model" class="vfs-editor"></textarea>
    <ReaderScreen v-else :html="model" />
  </section>
</template>
