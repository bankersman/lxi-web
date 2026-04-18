<script setup lang="ts">
import { ref } from "vue";
import { Bookmark, Check, Pencil, Plug, Trash2, X } from "lucide-vue-next";
import type { SavedConnection } from "@/stores/savedConnections";
import { useSavedConnectionsStore } from "@/stores/savedConnections";
import { useSessionsStore } from "@/stores/sessions";

const emit = defineEmits<{
  (e: "connected", entry: SavedConnection): void;
}>();

const saved = useSavedConnectionsStore();
const sessions = useSessionsStore();

const busyId = ref<string | null>(null);
const errorId = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const editingId = ref<string | null>(null);
const draftLabel = ref("");

async function connect(entry: SavedConnection): Promise<void> {
  if (busyId.value) return;
  busyId.value = entry.id;
  errorId.value = null;
  errorMessage.value = null;
  try {
    await sessions.open(entry.host, entry.port);
    emit("connected", entry);
  } catch (err) {
    errorId.value = entry.id;
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    busyId.value = null;
  }
}

function forget(entry: SavedConnection): void {
  if (
    !window.confirm(
      `Forget saved connection "${entry.label}"? This only removes it from this browser.`,
    )
  ) {
    return;
  }
  saved.remove(entry.id);
}

function toggleAuto(entry: SavedConnection): void {
  saved.setAutoConnect(entry.id, !entry.autoConnect);
}

function startEdit(entry: SavedConnection): void {
  editingId.value = entry.id;
  draftLabel.value = entry.label;
}

function commitEdit(entry: SavedConnection): void {
  const label = draftLabel.value.trim() || entry.host;
  saved.update(entry.id, { label });
  editingId.value = null;
}

function cancelEdit(): void {
  editingId.value = null;
}
</script>

<template>
  <section
    v-if="saved.count > 0"
    class="flex flex-col gap-2 border-b border-border px-4 py-3"
  >
    <div class="flex items-center gap-2 text-sm font-medium">
      <Bookmark class="h-4 w-4 text-fg-muted" aria-hidden="true" />
      Saved connections
    </div>
    <p class="text-xs text-fg-muted">
      Stored in this browser only — nothing is sent to the server.
    </p>
    <ul class="flex flex-col gap-1 rounded-md border border-border">
      <li
        v-for="entry in saved.list"
        :key="entry.id"
        class="flex flex-col gap-1 border-b border-border p-2 text-xs last:border-b-0"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <template v-if="editingId === entry.id">
              <label class="sr-only" :for="`rename-${entry.id}`">
                Rename {{ entry.host }}
              </label>
              <div class="flex items-center gap-1">
                <input
                  :id="`rename-${entry.id}`"
                  v-model="draftLabel"
                  type="text"
                  autocomplete="off"
                  class="h-7 w-full rounded-md border border-border bg-surface-2 px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  @keydown.enter.prevent="commitEdit(entry)"
                  @keydown.escape.prevent="cancelEdit"
                />
                <button
                  type="button"
                  class="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label="Save label"
                  @click="commitEdit(entry)"
                >
                  <Check class="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label="Cancel rename"
                  @click="cancelEdit"
                >
                  <X class="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </template>
            <template v-else>
              <div class="truncate font-medium text-fg">{{ entry.label }}</div>
              <div class="truncate font-mono text-fg-muted">
                {{ entry.host }}:{{ entry.port }}
              </div>
            </template>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md border border-accent/40 px-2 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="busyId === entry.id"
              :aria-label="`Connect to ${entry.label}`"
              @click="connect(entry)"
            >
              <Plug class="h-3.5 w-3.5" aria-hidden="true" />
              {{ busyId === entry.id ? "…" : "Connect" }}
            </button>
            <button
              v-if="editingId !== entry.id"
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              :aria-label="`Rename ${entry.label}`"
              @click="startEdit(entry)"
            >
              <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-state-error/10 hover:text-state-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-state-error"
              :aria-label="`Forget ${entry.label}`"
              @click="forget(entry)"
            >
              <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <label class="flex items-center gap-1.5 text-[11px] text-fg-muted">
          <input
            type="checkbox"
            class="h-3 w-3 rounded border-border"
            :checked="entry.autoConnect"
            @change="toggleAuto(entry)"
          />
          Auto-connect on launch
        </label>
        <p
          v-if="errorId === entry.id && errorMessage"
          class="rounded-md border border-state-error/30 bg-state-error/10 px-2 py-1 text-state-error"
          role="alert"
        >
          {{ errorMessage }}
        </p>
      </li>
    </ul>
  </section>
</template>
