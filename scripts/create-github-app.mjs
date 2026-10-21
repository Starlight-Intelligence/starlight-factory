#!/usr/bin/env node
// Creates the factory's GitHub App through GitHub's manifest flow and writes its credentials to a
// git-ignored env file, so the private key goes from GitHub to your disk and nowhere else.
//
//   node scripts/create-github-app.mjs --owner <org-or-user> --webhook https://<domain>/eve/v1/github
//
// Opens a local page with one button. GitHub creates the app with the permissions the factory
// needs, redirects back here with a one-time code, and this script exchanges it for the app id,
// slug, private key and webhook secret. It also generates FACTORY_ROUTE_PASSWORD. Install the app
// on FACTORY_REPO afterwards.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, writeSync } from "node:fs";
import { createServer } from "node:http";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { default: "starlight-factory", type: "string" },
    out: { default: ".env.railway.local", type: "string" },
    owner: { type: "string" },
    port: { default: "3918", type: "string" },
    webhook: { type: "string" },
  },
});

if (!(values.owner && values.webhook)) {
  console.error(
    "Usage: node scripts/create-github-app.mjs --owner <org-or-user> --webhook https://<domain>/eve/v1/github"
  );
  process.exit(2);
}

// Refuse up front, before an app exists, rather than after GitHub has handed over a key.
const outExists = (() => {
  try {
    lstatSync(values.out);
    return true;
  } catch {
    return existsSync(values.out);
  }
})();
if (outExists) {
  console.error(
    `${values.out} already exists. Move it away or pass --out <new file>; this script never overwrites credentials.`
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

/**
 * Creates the file exclusively (never follows or replaces an existing path), restricts it to the
 * current user before any secret is written, then writes. On Windows the POSIX mode is ignored, so
 * the ACL is set explicitly with icacls.
 */
const writePrivateFile = (path, contents) => {
  const fd = openSync(path, "wx", 0o600);
  try {
    if (process.platform === "win32") {
      execFileSync(
        "icacls",
        [path, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:F`],
        { stdio: "ignore" }
      );
    }
    writeSync(fd, contents);
  } finally {
    closeSync(fd);
  }
};

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
    values.out,
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
    `<body style="font:16px system-ui;max-width:40rem;margin:4rem auto"><h1>Created ${escapeHtml(app.slug)}</h1><p>Credentials and a route password are in <code>${escapeHtml(values.out)}</code>. Now install the app on your FACTORY_REPO:</p><p><a href="${escapeHtml(install)}">${escapeHtml(install)}</a></p></body>`,
    "text/html; charset=utf-8"
  );
  console.log(
    `Created ${app.slug}. Wrote ${values.out} (app id, slug, webhook secret, private key, route password). Install it: ${install}`
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
      console.error(`Setup failed: ${error.message}`);
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
