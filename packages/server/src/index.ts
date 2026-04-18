import { buildServer } from "./server.js";

const host = process.env.HOST ?? "127.0.0.1";
const portEnv = process.env.PORT;
const port = portEnv ? Number.parseInt(portEnv, 10) : 8787;

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[lxi-web] Invalid PORT: ${portEnv}`);
  process.exit(1);
}

const app = await buildServer();

try {
  await app.listen({ host, port });
  app.log.info({ host, port }, "lxi-web server listening");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
