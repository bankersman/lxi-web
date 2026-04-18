import type { IElectronicLoad } from "./electronic-load.js";
import type { IPowerSupply } from "./power-supply.js";
import type { ISignalGenerator } from "./signal-generator.js";

/** Result of attempting to disable outputs on one instrument. */
export interface OutputKillResult {
  readonly kind: "ok" | "partial" | "error";
  readonly touched: string[];
  readonly errors?: ReadonlyArray<{ readonly target: string; readonly message: string }>;
}

export interface PanicResult {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly touchedSessions: ReadonlyArray<{
    readonly sessionId: string;
    readonly idn: string;
    readonly outcome: OutputKillResult;
    readonly elapsedMs: number;
  }>;
  readonly skippedSessions: ReadonlyArray<{
    readonly sessionId: string;
    readonly reason: string;
  }>;
}

export async function runPsuDisableAll(psu: IPowerSupply): Promise<OutputKillResult> {
  const touched: string[] = [];
  const errors: Array<{ target: string; message: string }> = [];
  try {
    if (psu.tracking && psu.getTracking && psu.setTracking) {
      try {
        if (await psu.getTracking()) await psu.setTracking(false);
      } catch (err) {
        errors.push({
          target: "tracking",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const channels = await psu.getChannels();
    for (const ch of channels) {
      try {
        await psu.setChannelOutput(ch.id, false);
        touched.push(`CH${ch.id}`);
      } catch (err) {
        errors.push({
          target: `CH${ch.id}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    errors.push({
      target: "psu",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const kind: OutputKillResult["kind"] =
    errors.length === 0 ? "ok" : touched.length > 0 ? "partial" : "error";
  return errors.length ? { kind, touched, errors } : { kind: "ok", touched };
}

export async function runEloadDisableAll(
  el: IElectronicLoad,
): Promise<OutputKillResult> {
  try {
    await el.setInputEnabled(false);
    return { kind: "ok", touched: ["input"] };
  } catch (err) {
    return {
      kind: "error",
      touched: [],
      errors: [
        {
          target: "input",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }
}

export async function runSgDisableAll(sg: ISignalGenerator): Promise<OutputKillResult> {
  const touched: string[] = [];
  const errors: Array<{ target: string; message: string }> = [];
  try {
    const channels = await sg.getChannels();
    for (const ch of channels) {
      try {
        await sg.setChannelEnabled(ch.id, false);
        touched.push(`CH${ch.id}`);
      } catch (err) {
        errors.push({
          target: `CH${ch.id}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    errors.push({
      target: "sg",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const kind: OutputKillResult["kind"] =
    errors.length === 0 ? "ok" : touched.length > 0 ? "partial" : "error";
  return errors.length ? { kind, touched, errors } : { kind: "ok", touched };
}
