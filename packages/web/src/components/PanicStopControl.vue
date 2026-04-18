<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { PanicResult } from "@lxi-web/core/browser";
import { api } from "@/api/client";
import { useSessionsStore } from "@/stores/sessions";

const LS_ALWAYS = "lxi.panic.alwaysSingleClick";
const SS_ONCE = "lxi.panic.confirmedOnce";

const sessions = useSessionsStore();

const alwaysSingleClick = ref(false);
const confirmOpen = ref(false);
const confirmAlways = ref(false);
const busy = ref(false);

const toast = ref<{
  message: string;
  detail?: string;
  variant: "ok" | "warn" | "err";
} | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const killableApprox = computed(() =>
  sessions.list.filter(
    (s) =>
      s.status === "connected" &&
      (s.kind === "powerSupply" ||
        s.kind === "electronicLoad" ||
        s.kind === "signalGenerator"),
  ).length,
);

function clearToastTimer(): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function showToast(
  message: string,
  variant: "ok" | "warn" | "err",
  detail?: string,
): void {
  clearToastTimer();
  toast.value = { message, variant, detail };
  toastTimer = setTimeout(() => {
    toast.value = null;
    toastTimer = null;
  }, 10_000);
}

function summarizePanic(r: PanicResult): { message: string; variant: "ok" | "warn" | "err"; detail?: string } {
  const n = r.touchedSessions.length;
  if (n === 0) {
    return {
      message: "Panic stop: no output-capable connected instruments.",
      variant: "ok",
    };
  }
  const worst = r.touchedSessions.some((t) => t.outcome.kind === "error")
    ? "err"
    : r.touchedSessions.some((t) => t.outcome.kind === "partial")
      ? "warn"
      : "ok";
  const ms = Math.max(0, Date.parse(r.finishedAt) - Date.parse(r.startedAt));
  const lines: string[] = [];
  for (const t of r.touchedSessions) {
    if (t.outcome.kind === "ok") continue;
    const errs = t.outcome.errors?.map((e) => `${e.target}: ${e.message}`).join("; ");
    lines.push(`${t.idn.slice(0, 48)} — ${t.outcome.kind}${errs ? ` (${errs})` : ""}`);
  }
  return {
    message: `All outputs off (${n} instrument${n === 1 ? "" : "s"}, ~${ms} ms).`,
    variant: worst,
    detail: lines.length ? lines.join("\n") : undefined,
  };
}

async function runPanic(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await api.panic();
    const s = summarizePanic(r);
    showToast(s.message, s.variant, s.detail);
  } catch (e) {
    showToast(
      e instanceof Error ? e.message : String(e),
      "err",
      "Check the server log and your bench wiring, then retry.",
    );
  } finally {
    busy.value = false;
  }
}

function onFirstClick(): void {
  if (alwaysSingleClick.value || sessionStorage.getItem(SS_ONCE) === "1") {
    void runPanic();
    return;
  }
  confirmOpen.value = true;
}

function cancelConfirm(): void {
  confirmOpen.value = false;
  confirmAlways.value = false;
}

function confirmPanic(): void {
  if (confirmAlways.value) {
    localStorage.setItem(LS_ALWAYS, "1");
    alwaysSingleClick.value = true;
  }
  sessionStorage.setItem(SS_ONCE, "1");
  confirmOpen.value = false;
  confirmAlways.value = false;
  void runPanic();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.ctrlKey && e.shiftKey && (e.key === "." || e.code === "Period")) {
    e.preventDefault();
    void runPanic();
  }
}

onMounted(() => {
  alwaysSingleClick.value = localStorage.getItem(LS_ALWAYS) === "1";
  window.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  clearToastTimer();
});

async function retryPanic(): Promise<void> {
  toast.value = null;
  await runPanic();
}
</script>

<template>
  <div class="relative flex flex-col items-end gap-1">
    <button
      type="button"
      class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-wait disabled:opacity-70"
      :disabled="busy"
      aria-label="Panic stop: disable all outputs"
      @click="onFirstClick"
    >
      Panic
    </button>

    <div
      v-if="confirmOpen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="panic-confirm-title"
      class="absolute right-0 top-full z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-3 shadow-lg"
    >
      <h2 id="panic-confirm-title" class="text-sm font-semibold text-fg">
        Disable all outputs?
      </h2>
      <p class="mt-1 text-xs text-fg-muted">
        Turns off every PSU channel, e-load input, and signal-generator output on
        <strong>{{ killableApprox }}</strong>
        connected instrument{{ killableApprox === 1 ? "" : "s" }} (drivers that support panic).
        Scope / DMM / SA sessions are skipped.
      </p>
      <label class="mt-2 flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
        <input v-model="confirmAlways" type="checkbox" class="rounded border-border" />
        <span>Always single-click panic (stored in this browser)</span>
      </label>
      <div class="mt-3 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
          @click="cancelConfirm"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          @click="confirmPanic"
        >
          Confirm
        </button>
      </div>
    </div>

    <div
      v-if="toast"
      role="status"
      class="fixed bottom-4 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border px-4 py-3 text-sm shadow-lg"
      :class="
        toast.variant === 'ok'
          ? 'border-emerald-700/40 bg-emerald-950/90 text-emerald-50'
          : toast.variant === 'warn'
            ? 'border-amber-700/40 bg-amber-950/90 text-amber-50'
            : 'border-red-700/40 bg-red-950/90 text-red-50'
      "
    >
      <p class="font-medium">{{ toast.message }}</p>
      <pre
        v-if="toast.detail"
        class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] opacity-90"
        >{{ toast.detail }}</pre
      >
      <div v-if="toast.variant !== 'ok'" class="mt-2 flex justify-end gap-2">
        <button
          type="button"
          class="rounded border border-white/30 px-2 py-1 text-xs hover:bg-white/10"
          @click="toast = null"
        >
          Dismiss
        </button>
        <button
          type="button"
          class="rounded bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25"
          @click="retryPanic"
        >
          Retry
        </button>
      </div>
    </div>
  </div>
</template>
