#!/usr/bin/env node
// Creates the factory's GitHub App through GitHub's manifest flow and writes its credentials to
// ~/.starlight-factory/<name>.env, a file only you can read from the moment it exists, so the
// private key goes from GitHub to your disk and nowhere else.
//
//   node scripts/create-github-app.mjs --owner <org-or-user> --webhook https://<domain>/eve/v1/github
//
// Opens a local page with one button. GitHub creates the app with the permissions the factory
// needs, redirects back here with a one-time code, and this script exchanges it for the app id,
// slug, private key and webhook secret. It also generates FACTORY_ROUTE_PASSWORD. Install the app
// on FACTORY_REPO afterwards.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { default: "starlight-factory", type: "string" },
    out: { type: "string" },
    owner: { type: "string" },
    port: { default: "3918", type: "string" },
    webhook: { type: "string" },
  },
});

if (!(values.owner && values.webhook)) {
  console.error(
    "Usage: node scripts/create-github-app.mjs --owner <org-or-user> --webhook https://<domain>/eve/v1/github [--out <file>]"
  );
  process.exit(2);
}

// Credentials live outside any checkout by default, in a directory only you can read.
const PRIVATE_DIR = join(homedir(), ".starlight-factory");
const out = resolve(values.out ?? join(PRIVATE_DIR, `${values.name}.env`));

const pathExists = (path) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return existsSync(path);
  }
};

const NOT_A_REPO = /not a git repository/i;

const nearestExistingDir = (path) => {
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  return dir;
};

/**
 * True unless git confirms `path` is outside every work tree or ignored. Any answer git can't give
 * (git missing, a safe.directory refusal, a broken repo) counts as tracked, so the key is never
 * written where it could be committed on the strength of a failed check.
 */
const gitWouldTrack = (path) => {
  const dir = nearestExistingDir(path);
  const inside = spawnSync(
    "git",
    ["-C", dir, "rev-parse", "--is-inside-work-tree"],
    { encoding: "utf8" }
  );
  if (inside.error) {
    return true;
  }
  if (inside.status !== 0) {
    return !NOT_A_REPO.test(inside.stderr);
  }
  if (inside.stdout.trim() !== "true") {
    return true;
  }
  const ignored = spawnSync("git", ["-C", dir, "check-ignore", "-q", path]);
  // 0: ignored. 1: not ignored. Anything else: git couldn't tell.
  return ignored.error !== undefined || ignored.status !== 0;
};

// Refuse up front, before an app exists, rather than after GitHub has handed over a key.
if (pathExists(out)) {
  console.error(
    `${out} already exists. Move it away or pass --out <new file>; this script never overwrites credentials.`
  );
  process.exit(1);
}
if (gitWouldTrack(out)) {
  console.error(
    `${out} is inside a git work tree and not ignored, so the key could be committed. Pick a path outside the checkout or one .gitignore covers.`
  );
  process.exit(1);
}

const port = Number(values.port);
const expectedHost = `127.0.0.1:${port}`;
const state = randomBytes(16).toString("hex");
const callback = `http://${expectedHost}/callback`;

const manifest = {
  default_events: [
    "check_suite",
    "issue_comment",
    "issues",
    "pull_request",
    "pull_request_review_comment",
  ],
  default_permissions: {
    checks: "read",
    contents: "write",
    issues: "write",
    metadata: "read",
    pull_requests: "write",
    statuses: "write",
  },
  hook_attributes: { active: true, url: values.webhook },
  name: values.name,
  public: false,
  redirect_url: callback,
  url: "https://github.com/Starlight-Intelligence/starlight-factory",
};

// A user account and an organization take different creation URLs.
const ownerType = await fetch(`https://api.github.com/users/${values.owner}`)
  .then((r) => (r.ok ? r.json() : null))
  .then((u) => u?.type);
if (!ownerType) {
  console.error(`GitHub has no account named ${values.owner}.`);
  process.exit(1);
}
const createUrl =
  ownerType === "Organization"
    ? `https://github.com/organizations/${values.owner}/settings/apps/new?state=${state}`
    : `https://github.com/settings/apps/new?state=${state}`;

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "'": "&#39;", '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[
        c
      ]
  );

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action https://github.com; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

const send = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": type });
  res.end(body);
};

const page = `<!doctype html><meta charset="utf-8"><title>Create the factory GitHub App</title>
<body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>Create ${escapeHtml(values.name)}</h1>
<p>Owner: <b>${escapeHtml(values.owner)}</b>. Webhook: <code>${escapeHtml(values.webhook)}</code>.</p>
<form action="${escapeHtml(createUrl)}" method="post">
<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
<button type="submit" style="font-size:1rem;padding:.6rem 1rem">Create on GitHub</button>
</form></body>`;

const isWindows = process.platform === "win32";
const WINDOWS_WRITER = fileURLToPath(
  new URL("./write-private-file.ps1", import.meta.url)
);

/**
 * Creates `path` exclusively and writes `contents`, readable only by the current account from the
 * moment the file exists, so nobody else can ever open it, even briefly.
 *
 * Windows: a POSIX mode does nothing there, and a folder's ACL can be widened behind our back (the
 * Codex Windows sandbox service adds a read grant for its sandbox users to new folders in the
 * profile within seconds). So `write-private-file.ps1` creates the file with an owner-only,
 * inheritance-protected ACL applied at creation, opens it unshared, writes, and proves the ACL.
 * The secrets travel on stdin, never in arguments. Elsewhere: O_CREAT|O_EXCL with mode 600.
 * Both refuse an existing path, including a symlink.
 */
const writePrivateFile = (path, contents) => {
  if (isWindows) {
    const result = spawnSync(
      "pwsh",
      ["-NoProfile", "-NonInteractive", "-File", WINDOWS_WRITER],
      {
        encoding: "utf8",
        env: { ...process.env, SF_PRIVATE_PATH: path },
        input: contents,
      }
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `could not create ${path} privately: ${(result.stderr ?? "").trim() || result.error?.code || `exit ${result.status}`}`
      );
    }
    return;
  }
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
};

// Prove the writer works before an app exists: a failure here costs nothing.
const preflightPrivateWrite = () => {
  mkdirSync(PRIVATE_DIR, { mode: 0o700, recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  const probe = join(dirname(out), `.probe-${randomBytes(6).toString("hex")}`);
  writePrivateFile(probe, "probe\n");
  unlinkSync(probe);
};

try {
  preflightPrivateWrite();
} catch (error) {
  console.error(
    `Cannot write credentials privately (${error.message}). Nothing was created.${isWindows ? " This needs PowerShell 7 (pwsh) on PATH." : ""}`
  );
  process.exit(1);
}

let claimed = false;

const handleCallback = async (url, res) => {
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || !code) {
    send(res, 400, "State mismatch or missing code. Start again.");
    return;
  }
  // Claimed before the first await, so a second callback can never exchange a code too.
  if (claimed) {
    send(res, 409, "This setup already ran. Start the script again.");
    return;
  }
  claimed = true;
  const conversion = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    { headers: { accept: "application/vnd.github+json" }, method: "POST" }
  );
  if (!conversion.ok) {
    send(res, 502, `GitHub refused the code (${conversion.status}).`);
    console.error(`Conversion failed with ${conversion.status}.`);
    process.exitCode = 1;
    server.close();
    return;
  }
  const app = await conversion.json();
  writePrivateFile(
    out,
    [
      "FACTORY_PLATFORM=railway",
      `FACTORY_ROUTE_PASSWORD=${randomBytes(24).toString("base64url")}`,
      `GITHUB_APP_ID=${app.id}`,
      `GITHUB_APP_SLUG=${app.slug}`,
      `GITHUB_WEBHOOK_SECRET=${app.webhook_secret}`,
      `GITHUB_APP_PRIVATE_KEY=${JSON.stringify(app.pem)}`,
      "",
    ].join("\n")
  );
  const install = `${app.html_url}/installations/new`;
  send(
    res,
    200,
    `<body style="font:16px system-ui;max-width:40rem;margin:4rem auto"><h1>Created ${escapeHtml(app.slug)}</h1><p>Credentials and a route password are in <code>${escapeHtml(out)}</code>. Now install the app on your FACTORY_REPO:</p><p><a href="${escapeHtml(install)}">${escapeHtml(install)}</a></p></body>`,
    "text/html; charset=utf-8"
  );
  console.log(
    `Created ${app.slug}. Wrote ${out} (app id, slug, webhook secret, private key, route password). Install it: ${install}`
  );
  server.close();
};

const server = createServer((req, res) => {
  // Only the exact loopback origin may load the state-bearing page (no DNS rebinding).
  if (req.headers.host !== expectedHost) {
    send(res, 421, "Wrong host.");
    return;
  }
  const url = new URL(req.url ?? "/", callback);
  if (req.method === "GET" && url.pathname === "/") {
    send(res, 200, page, "text/html; charset=utf-8");
    return;
  }
  if (req.method === "GET" && url.pathname === "/callback") {
    handleCallback(url, res).catch((error) => {
      // Name and code only: a message could carry part of what GitHub returned.
      console.error(`Setup failed (${error.code ?? error.name}).`);
      process.exitCode = 1;
      send(res, 500, "Setup failed; see the terminal.");
      server.close();
    });
    return;
  }
  send(res, 404, "Not found.");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Open http://${expectedHost}/ and press "Create on GitHub".`);
});
