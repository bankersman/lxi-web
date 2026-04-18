<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Bookmark,
  BookmarkCheck,
  ClipboardCopy,
  Power,
  RefreshCcw,
  TerminalSquare,
  Check,
} from "lucide-vue-next";
import { shortIdentity, type SessionSummary } from "@lxi-web/core/browser";
import { useSessionsStore } from "@/stores/sessions";
import { useSavedConnectionsStore } from "@/stores/savedConnections";
import StatusIndicator from "./StatusIndicator.vue";
import DeviceKindIcon from "./DeviceKindIcon.vue";
import { kindLabel } from "@/lib/labels";

const props = defineProps<{
  session: SessionSummary;
  rawConsoleAnchor?: string;
}>();

const router = useRouter();
const sessions = useSessionsStore();
const saved = useSavedConnectionsStore();

const title = computed(() =>
  props.session.identity ? shortIdentity(props.session.identity) : "Connecting…",
);

const canReconnect = computed(() => props.session.status === "error");
const identityFields = computed(() => {
  const i = props.session.identity;
  if (!i) return [];
  return [
    { label: "Vendor", value: i.manufacturer || "—" },
    { label: "Model", value: i.model || "—" },
    { label: "Serial", value: i.serial || "—" },
    { label: "Firmware", value: i.firmware || "—" },
  ];
});

const savedEntry = computed(() =>
  saved.findByAddress(props.session.host, props.session.port),
);
const isAutoConnect = computed(() => Boolean(savedEntry.value?.autoConnect));

const copied = ref(false);
const reconnecting = ref(false);
const actionError = ref<string | null>(null);

async function copyIdn(): Promise<void> {
  const raw = props.session.identity?.raw;
  if (!raw) return;
  try {
    await navigator.clipboard.writeText(raw);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    actionError.value = "Clipboard access denied by the browser.";
  }
}

async function reconnect(): Promise<void> {
  if (reconnecting.value) return;
  reconnecting.value = true;
  actionError.value = null;
  try {
    await sessions.reconnect(props.session.id);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    reconnecting.value = false;
  }
}

async function disconnect(): Promise<void> {
  if (!window.confirm(`Disconnect from ${title.value}?`)) return;
  await sessions.remove(props.session.id);
  router.push("/");
}

function toggleAutoConnect(): void {
  let entry = savedEntry.value;
  if (!entry) {
    entry = saved.add({
      host: props.session.host,
      port: props.session.port,
      autoConnect: true,
    });
    return;
  }
  saved.setAutoConnect(entry.id, !entry.autoConnect);
}

function focusRawConsole(): void {
  const id = props.rawConsoleAnchor ?? "raw-scpi";
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusable = el.querySelector<HTMLElement>(
    'textarea, input, button, [tabindex]:not([tabindex="-1"])',
  );
  focusable?.focus();
}
</script>

<template>
  <section
    class="mb-6 flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface-2 p-5"
  >
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex items-center gap-3">
        <span
          class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-3 text-accent"
          aria-hidden="true"
        >
          <DeviceKindIcon :kind="session.kind" />
        </span>
        <div>
          <h2 class="text-lg font-semibold">{{ title }}</h2>
          <p class="text-xs text-fg-muted">
            {{ kindLabel(session.kind) }} — {{ session.host }}:{{ session.port }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="canReconnect"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="reconnecting"
          @click="reconnect"
        >
          <RefreshCcw
            class="h-3.5 w-3.5"
            :class="reconnecting ? 'animate-spin' : ''"
            aria-hidden="true"
          />
          {{ reconnecting ? "Reconnecting…" : "Reconnect" }}
        </button>
        <StatusIndicator :status="session.status" />
      </div>
    </header>

    <p
      v-if="session.error"
      class="rounded-md border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs text-state-error"
      role="alert"
    >
      {{ session.error.message }}
    </p>
    <p
      v-if="actionError"
      class="rounded-md border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs text-state-error"
      role="alert"
    >
      {{ actionError }}
    </p>

    <dl
      v-if="identityFields.length > 0"
      class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4"
    >
      <div v-for="field in identityFields" :key="field.label" class="min-w-0">
        <dt class="font-medium text-fg-muted">{{ field.label }}</dt>
        <dd class="truncate font-mono text-fg">{{ field.value }}</dd>
      </div>
    </dl>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!session.identity"
        :aria-label="copied ? '*IDN? copied' : 'Copy *IDN? to clipboard'"
        @click="copyIdn"
      >
        <Check v-if="copied" class="h-3.5 w-3.5 text-state-connected" aria-hidden="true" />
        <ClipboardCopy v-else class="h-3.5 w-3.5" aria-hidden="true" />
        {{ copied ? "Copied" : "Copy *IDN?" }}
      </button>

      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        @click="focusRawConsole"
      >
        <TerminalSquare class="h-3.5 w-3.5" aria-hidden="true" />
        Raw SCPI
      </button>

      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :aria-pressed="isAutoConnect"
        @click="toggleAutoConnect"
      >
        <BookmarkCheck
          v-if="isAutoConnect"
          class="h-3.5 w-3.5 text-accent"
          aria-hidden="true"
        />
        <Bookmark v-else class="h-3.5 w-3.5" aria-hidden="true" />
        {{ isAutoConnect ? "Auto-connect on" : "Auto-connect off" }}
      </button>

      <button
        type="button"
        class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-fg-muted hover:bg-state-error/10 hover:text-state-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-state-error"
        @click="disconnect"
      >
        <Power class="h-3.5 w-3.5" aria-hidden="true" />
        Disconnect
      </button>
    </div>
  </section>
</template>
