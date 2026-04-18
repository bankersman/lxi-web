// Copies docs/user/*.md into docs/site/manual/ and docs/contributing/*.md
// into docs/site/contributing/ so VitePress renders a single source of
// truth. Keeps the copy minimal — no Markdown rewrites, no front matter
// injection — because GitHub and VitePress both accept plain .md.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = dirname(here);
const userDir = join(siteRoot, "..", "user");
const contribDir = join(siteRoot, "..", "contributing");
const manualDir = join(siteRoot, "manual");
const siteContribDir = join(siteRoot, "contributing");

async function syncDir(srcDir, dstDir) {
  await rm(dstDir, { recursive: true, force: true });
  await mkdir(dstDir, { recursive: true });
  let count = 0;
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    const body = await readFile(src, "utf8");
    await writeFile(dst, rewriteLinks(body), "utf8");
    count += 1;
  }
  return count;
}

async function main() {
  const manualCount = await syncDir(userDir, manualDir);
  const contribCount = await syncDir(contribDir, siteContribDir);
  console.log(
    `[docs] synced ${manualCount} manual page(s) + ${contribCount} contributing page(s)`,
  );
}

// Single source of truth for the repo slug. Overridable by
// `DOCS_REPO_SLUG` so a fork can rebuild the VitePress site against
// their own github.com/<owner>/<repo> without touching markdown.
// README.md + docs/user/*.md still hardcode the canonical slug because
// GitHub renders them directly with no build step — but any such
// hardcode inside the synced manual gets normalized through
// `rewriteRepoSlug` below so fork builds come out right.
const repoSlug = process.env.DOCS_REPO_SLUG ?? "bankersman/lxi-web";
const repoBranch = process.env.DOCS_REPO_BRANCH ?? "main";
const repoHome = `https://github.com/${repoSlug}`;
const repoBlobUrl = `${repoHome}/blob/${repoBranch}`;
const canonicalSlug = "bankersman/lxi-web";

export { repoSlug, repoHome, repoBlobUrl };

function rewriteLinks(md) {
  // `../../<path>` from docs/<section>/*.md reaches into the repo root.
  // VitePress only knows about files under docs/site/, so rewrite those
  // to absolute GitHub URLs. On GitHub the original relative link already
  // works; this only affects the synced site copy.
  let out = md.replace(/\]\(\.\.\/\.\.\/([^)\s]+)\)/g, (_match, path) => {
    return `](${repoBlobUrl}/${path})`;
  });
  // `../user/foo.md` from docs/contributing/*.md is copied into
  // docs/site/manual/foo.md on the site; rewrite to the site path so the
  // built links resolve. GitHub-native rendering keeps the ../user/ path.
  out = out.replace(
    /\]\(\.\.\/user\/([^)\s#]+)(\.md)?(#[^)\s]+)?\)/g,
    (_match, slug, _ext, hash) => `](/manual/${slug.replace(/\.md$/, "")}${hash ?? ""})`,
  );
  // `../contributing/foo.md` from docs/user/*.md is copied into
  // docs/site/contributing/foo.md on the site.
  out = out.replace(
    /\]\(\.\.\/contributing\/([^)\s#]+)(\.md)?(#[^)\s]+)?\)/g,
    (_match, slug, _ext, hash) =>
      `](/contributing/${slug.replace(/\.md$/, "")}${hash ?? ""})`,
  );
  // `../steps/<name>.md` references the implementation plan under
  // docs/steps/. That directory is not synced into the site (it's
  // maintainer-facing), so point those links at GitHub.
  out = out.replace(/\]\(\.\.\/steps\/([^)\s]+)\)/g, (_match, path) => {
    return `](${repoBlobUrl}/docs/steps/${path})`;
  });
  // Normalize the canonical `bankersman/lxi-web` slug to the configured
  // `repoSlug`. No-op in the default build; for forks that set
  // `DOCS_REPO_SLUG`, every hardcoded github.com/bankersman/lxi-web in
  // the manual source redirects to their fork in the built site.
  if (repoSlug !== canonicalSlug) {
    out = out.replaceAll(
      `https://github.com/${canonicalSlug}/`,
      `${repoHome}/`,
    );
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
