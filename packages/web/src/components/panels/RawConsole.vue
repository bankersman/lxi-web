<script setup lang="ts">
import { ref } from "vue";
import { Send } from "lucide-vue-next";
import { api } from "@/api/client";

const props = defineProps<{ sessionId: string; disabled?: boolean }>();

interface LogEntry {
  readonly id: number;
  readonly direction: "tx" | "rx" | "err";
  readonly text: string;
  readonly at: number;
}

const queryCommand = ref("");
const writeCommand = ref("");
const writeExpectReply = ref(false);
const log = ref<LogEntry[]>([]);
const busyQuery = ref(false);
const busyWrite = ref(false);
let nextId = 1;

function push(entry: Omit<LogEntry, "id" | "at">): void {
  log.value = [{ ...entry, id: nextId++, at: Date.now() }, ...log.value].slice(0, 100);
}

async function sendQuery(): Promise<void> {
  const cmd = queryCommand.value.trim();
  if (!cmd || busyQuery.value) return;
  busyQuery.value = true;
  push({ direction: "tx", text: cmd });
  try {
    const reply = await api.sendScpi(props.sessionId, cmd, true);
    if (reply !== null) push({ direction: "rx", text: reply });
  } catch (err) {
    push({ direction: "err", text: err instanceof Error ? err.message : String(err) });
  } finally {
    busyQuery.value = false;
  }
}

async function sendWrite(): Promise<void> {
  const cmd = writeCommand.value.trim();
  if (!cmd || busyWrite.value) return;
  busyWrite.value = true;
  push({ direction: "tx", text: cmd });
  try {
    const wantReply =
      writeExpectReply.value || cmd.trim().endsWith("?");
    const reply = await api.sendScpi(props.sessionId, cmd, wantReply);
    if (reply !== null) push({ direction: "rx", text: reply });
  } catch (err) {
    push({ direction: "err", text: err instanceof Error ? err.message : String(err) });
  } finally {
    busyWrite.value = false;
  }
}

function onKeydownQuery(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendQuery();
  }
}

function onKeydownWrite(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendWrite();
  }
}
</script>

<template>
  <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <h3 class="mb-2 text-sm font-semibold">Raw SCPI console</h3>
    <p class="mb-3 text-xs text-fg-muted">
      <strong>Query</strong> always waits for a reply. <strong>Write</strong> sends a command;
      enable “Wait for reply” when the instrument returns data without <code>?</code>.
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <form class="flex flex-col gap-2" @submit.prevent="sendQuery">
        <span class="text-xs font-medium">Query</span>
        <label for="scpi-query" class="sr-only">SCPI query</label>
        <textarea
          id="scpi-query"
          v-model="queryCommand"
          rows="2"
          placeholder="*IDN?"
          :disabled="disabled"
          spellcheck="false"
          class="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @keydown="onKeydownQuery"
        />
        <button
          type="submit"
          class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="busyQuery || disabled || !queryCommand.trim()"
        >
          <Send class="h-3.5 w-3.5" aria-hidden="true" />
          Run query
        </button>
      </form>
      <form class="flex flex-col gap-2" @submit.prevent="sendWrite">
        <span class="text-xs font-medium">Write</span>
        <label for="scpi-write" class="sr-only">SCPI write</label>
        <textarea
          id="scpi-write"
          v-model="writeCommand"
          rows="2"
          placeholder="OUTP ON"
          :disabled="disabled"
          spellcheck="false"
          class="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @keydown="onKeydownWrite"
        />
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            class="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busyWrite || disabled || !writeCommand.trim()"
          >
            <Send class="h-3.5 w-3.5" aria-hidden="true" />
            Send write
          </button>
          <label class="flex items-center gap-1 text-[11px] text-fg-muted">
            <input v-model="writeExpectReply" type="checkbox" />
            Wait for reply
          </label>
        </div>
      </form>
    </div>

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
