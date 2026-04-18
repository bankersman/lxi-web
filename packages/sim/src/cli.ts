#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Simulator } from "./simulator.js";
import { createDefaultPersonalityRegistry } from "../personalities/index.js";
import type { PersonalityRegistry } from "./registry.js";

interface CliArgs {
  readonly personality?: string;
  readonly host?: string;
  readonly port?: number;
  readonly serial?: string;
  readonly idn?: string;
  readonly opt?: string;
  readonly config?: string;
  readonly verbose?: boolean;
  readonly help?: boolean;
  readonly list?: boolean;
}

interface BenchConfigEntry {
  readonly personality: string;
  readonly port: number;
  readonly host?: string;
  readonly serial?: string;
  readonly idnOverride?: string;
  readonly optOverride?: string;
}

interface BenchConfig {
  readonly host?: string;
  readonly instances: readonly BenchConfigEntry[];
}

function parseArgs(argv: readonly string[]): CliArgs {
  const out: Record<string, string | number | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!;
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2);
    if (key === "help" || key === "verbose" || key === "list") {
      out[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    i += 1;
    const asNumber = Number(next);
    out[key] = key === "port" && Number.isFinite(asNumber) ? asNumber : next;
  }
  return out as unknown as CliArgs;
}

function usage(): string {
  return [
    "Usage: lxi-sim --personality <id> [--port 5025] [--host 127.0.0.1]",
    "                      [--serial SIM000001] [--idn 'VENDOR,MODEL,{serial},FW']",
    "                      [--opt 'OPT1,OPT2'] [--verbose]",
    "       lxi-sim --config <path-to-bench.json>",
    "       lxi-sim --list",
    "",
    "Environment: LXI_SIM_HOST, LXI_SIM_PORT, LXI_SIM_VERBOSE.",
    "",
    "Run `--list` to see all available personalities.",
  ].join("\n");
}

function envPort(): number | undefined {
  const raw = process.env["LXI_SIM_PORT"];
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function makeLogger(verbose: boolean): ((msg: string) => void) | undefined {
  if (!verbose) return undefined;
  return (msg) => {
    process.stdout.write(`${new Date().toISOString()} ${msg}\n`);
  };
}

async function runSingle(
  registry: PersonalityRegistry,
  args: CliArgs,
): Promise<Simulator[]> {
  if (!args.personality) {
    throw new Error("--personality is required (or pass --config).\n\n" + usage());
  }
  const personality = registry.get(args.personality);
  if (!personality) {
    throw new Error(
      `unknown personality: ${args.personality}. Run with --list to see options.`,
    );
  }
  const verbose = args.verbose ?? process.env["LXI_SIM_VERBOSE"] === "1";
  const logger = makeLogger(verbose);
  const sim = new Simulator({
    personality,
    idnOverride: args.idn,
    optOverride: args.opt,
    serial: args.serial,
    logger,
  });
  const host = args.host ?? process.env["LXI_SIM_HOST"] ?? "127.0.0.1";
  const port = args.port ?? envPort() ?? 5025;
  await sim.listen({ host, port });
  return [sim];
}

async function runBench(
  registry: PersonalityRegistry,
  args: CliArgs,
): Promise<Simulator[]> {
  const configPath = resolve(process.cwd(), args.config!);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as BenchConfig;
  const verbose = args.verbose ?? process.env["LXI_SIM_VERBOSE"] === "1";
  const logger = makeLogger(verbose);
  const defaultHost = config.host ?? args.host ?? "127.0.0.1";
  const sims: Simulator[] = [];
  for (const entry of config.instances) {
    const personality = registry.get(entry.personality);
    if (!personality) {
      throw new Error(
        `bench entry references unknown personality: ${entry.personality}`,
      );
    }
    const sim = new Simulator({
      personality,
      idnOverride: entry.idnOverride,
      optOverride: entry.optOverride,
      serial: entry.serial,
      logger,
    });
    await sim.listen({ host: entry.host ?? defaultHost, port: entry.port });
    sims.push(sim);
  }
  return sims;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const registry = createDefaultPersonalityRegistry();
  if (args.list) {
    for (const p of registry.list()) {
      process.stdout.write(`${p.id.padEnd(24)} ${p.kind ?? ""}\n`);
    }
    return;
  }
  const sims = args.config
    ? await runBench(registry, args)
    : await runSingle(registry, args);

  const handleShutdown = async (): Promise<void> => {
    process.stdout.write("\nshutting down simulators...\n");
    await Promise.allSettled(sims.map((s) => s.close()));
    process.exit(0);
  };
  process.on("SIGINT", () => void handleShutdown());
  process.on("SIGTERM", () => void handleShutdown());

  for (const s of sims) {
    process.stdout.write(
      `simulator "${s.personality.id}" listening on port ${s.port}\n`,
    );
  }
}

void main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
