import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";

/**
 * Mount the built Vite SPA at `/` when a `WEB_DIST` directory is present.
 *
 * The dev loop is unaffected — `pnpm dev` runs the Vite dev server on 5173
 * and proxies API/WS traffic to 8787, so we only enable the static serve
 * when an explicit path is set or the default monorepo `packages/web/dist`
 * exists on disk.
 */
export async function registerWebRoutes(app: FastifyInstance): Promise<void> {
  const webDist = resolveWebDist();
  if (!webDist) {
    app.log.info("web-static disabled: no dist directory found");
    return;
  }

  const indexHtmlPath = resolve(webDist, "index.html");
  if (!existsSync(indexHtmlPath)) {
    app.log.warn({ webDist }, "web-static disabled: index.html missing");
    return;
  }

  await app.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
    wildcard: false,
    index: ["index.html"],
    cacheControl: true,
    maxAge: "1h",
  });

  const indexHtml = await readFile(indexHtmlPath, "utf8");

  app.setNotFoundHandler(async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.raw.url ?? "/";
    if (
      url.startsWith("/api/") ||
      url.startsWith("/ws") ||
      url === "/healthz"
    ) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.type("text/html").send(indexHtml);
  });

  app.log.info({ webDist }, "web-static serving SPA");
}

function resolveWebDist(): string | null {
  const explicit = process.env.WEB_DIST?.trim();
  if (explicit) {
    const abs = resolve(explicit);
    return existsSync(abs) ? abs : null;
  }

  const monorepoDefault = resolve(
    process.cwd(),
    "packages/web/dist",
  );
  if (existsSync(monorepoDefault)) return monorepoDefault;

  return null;
}
