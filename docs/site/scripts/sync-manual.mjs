// Copies docs/user/*.md into docs/site/manual/ so VitePress renders a single
// source of truth. Keeps the copy minimal — no Markdown rewrites, no front
// matter injection — because GitHub and VitePress both accept plain .md.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = dirname(here);
const userDir = join(siteRoot, "..", "user");
const manualDir = join(siteRoot, "manual");

async function main() {
  await rm(manualDir, { recursive: true, force: true });
  await mkdir(manualDir, { recursive: true });

  const entries = await readdir(userDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const src = join(userDir, entry.name);
    const dst = join(manualDir, entry.name);
    const body = await readFile(src, "utf8");
    await writeFile(dst, rewriteLinks(body), "utf8");
  }
  console.log(`[docs] synced ${entries.length} page(s) into manual/`);
}

// "../../<path>" from docs/user/*.md reaches into the repo root. VitePress
// treats those as dead links because the site only knows about files under
// docs/site/. Rewrite them to absolute GitHub URLs so the rendered site
// still links to the right file. On GitHub the original relative link
// already works, so this only affects the site copy.
const repoSlug = process.env.DOCS_REPO_SLUG ?? "lxi-web/lxi-web";
const repoBranch = process.env.DOCS_REPO_BRANCH ?? "main";
const repoUrl = `https://github.com/${repoSlug}/blob/${repoBranch}`;

function rewriteLinks(md) {
  return md.replace(/\]\(\.\.\/\.\.\/([^)\s]+)\)/g, (_match, path) => {
    return `](${repoUrl}/${path})`;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
