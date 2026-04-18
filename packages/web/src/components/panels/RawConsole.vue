<script setup lang="ts">
import { computed, ref } from "vue";
import { Send } from "lucide-vue-next";
import { api } from "@/api/client";

const props = defineProps<{ sessionId: string; disabled?: boolean }>();

interface LogEntry {
  readonly id: number;
  readonly direction: "tx" | "rx" | "err";
  readonly text: string;
  readonly at: number;
}

const command = ref("");
const expectReply = ref(true);
const log = ref<LogEntry[]>([]);
const busy = ref(false);
let nextId = 1;

const isQuery = computed(() => command.value.trim().endsWith("?"));

function push(entry: Omit<LogEntry, "id" | "at">): void {
  log.value = [{ ...entry, id: nextId++, at: Date.now() }, ...log.value].slice(0, 100);
}

async function send(): Promise<void> {
  const cmd = command.value.trim();
  if (!cmd || busy.value) return;
  busy.value = true;
  push({ direction: "tx", text: cmd });
  try {
    const wantReply = expectReply.value || isQuery.value;
    const reply = await api.sendScpi(props.sessionId, cmd, wantReply);
    if (reply !== null) push({ direction: "rx", text: reply });
  } catch (err) {
    push({ direction: "err", text: err instanceof Error ? err.message : String(err) });
  } finally {
    busy.value = false;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void send();
  }
}
</script>

<template>
  <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <h3 class="mb-2 text-sm font-semibold">Raw SCPI console</h3>
    <p class="mb-3 text-xs text-fg-muted">
      Send raw SCPI commands to this instrument. Commands ending in <code>?</code>
      automatically wait for a reply.
    </p>
    <form class="flex items-start gap-2" @submit.prevent="send">
      <label for="scpi-input" class="sr-only">SCPI command</label>
      <textarea
        id="scpi-input"
        v-model="command"
        rows="2"
        placeholder="*IDN?"
        :disabled="disabled"
        spellcheck="false"
        class="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        @keydown="onKeydown"
      />
      <div class="flex flex-col gap-1">
        <button
          type="submit"
          class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="busy || disabled || !command.trim()"
        >
          <Send class="h-3.5 w-3.5" aria-hidden="true" />
          Send
        </button>
        <label class="flex items-center gap-1 text-[11px] text-fg-muted">
          <input v-model="expectReply" type="checkbox" />
          Wait for reply
        </label>
      </div>
    </form>

    <ol
      class="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto font-mono text-xs"
      aria-live="polite"
    >
      <li
        v-for="entry in log"
        :key="entry.id"
        class="rounded-md px-2 py-1"
        :class="{
          'bg-surface-3 text-fg': entry.direction === 'tx',
          'bg-accent/10 text-accent': entry.direction === 'rx',
          'bg-state-error/10 text-state-error': entry.direction === 'err',
        }"
      >
        <span class="mr-2 text-[10px] uppercase tracking-wide opacity-70">
          {{ entry.direction === "tx" ? "→" : entry.direction === "rx" ? "←" : "!" }}
        </span>
        <span class="whitespace-pre-wrap break-words">{{ entry.text }}</span>
      </li>
      <li v-if="log.length === 0" class="text-xs text-fg-muted">No traffic yet.</li>
    </ol>
  </section>
</template>
