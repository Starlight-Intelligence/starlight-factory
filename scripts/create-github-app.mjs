#!/usr/bin/env node
// Creates the factory's GitHub App through GitHub's manifest flow and writes its credentials to a
// git-ignored env file, so the private key goes from GitHub to your disk and nowhere else.
//
//   node scripts/create-github-app.mjs --owner <org-or-user> --webhook https://<domain>/eve/v1/github
//
// Opens a local page with one button. GitHub creates the app with the permissions the factory
// needs, redirects back here with a one-time code, and this script exchanges it for the app id,
// slug, private key and webhook secret. Install the app on FACTORY_REPO afterwards.

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
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

const port = Number(values.port);
const state = randomBytes(16).toString("hex");
const callback = `http://127.0.0.1:${port}/callback`;

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
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "'": "&#39;", '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[
        c
      ]
  );

const page = `<!doctype html><meta charset="utf-8"><title>Create the factory GitHub App</title>
<body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>Create ${escapeHtml(values.name)}</h1>
<p>Owner: <b>${escapeHtml(values.owner)}</b>. Webhook: <code>${escapeHtml(values.webhook)}</code>.</p>
<form action="${escapeHtml(createUrl)}" method="post">
<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
<button type="submit" style="font-size:1rem;padding:.6rem 1rem">Create on GitHub</button>
</form></body>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", callback);
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || !code) {
    res.writeHead(400).end("State mismatch or missing code. Start again.");
    return;
  }
  const conversion = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    { headers: { accept: "application/vnd.github+json" }, method: "POST" }
  );
  if (!conversion.ok) {
    res.writeHead(502).end(`GitHub refused the code (${conversion.status}).`);
    console.error(`Conversion failed with ${conversion.status}.`);
    server.close();
    process.exitCode = 1;
    return;
  }
  const app = await conversion.json();
  const quotedKey = JSON.stringify(app.pem);
  writeFileSync(
    values.out,
    [
      "FACTORY_PLATFORM=railway",
      `GITHUB_APP_ID=${app.id}`,
      `GITHUB_APP_SLUG=${app.slug}`,
      `GITHUB_WEBHOOK_SECRET=${app.webhook_secret}`,
      `GITHUB_APP_PRIVATE_KEY=${quotedKey}`,
      "",
    ].join("\n"),
    { mode: 0o600 }
  );
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<body style="font:16px system-ui;max-width:40rem;margin:4rem auto"><h1>Created ${escapeHtml(app.slug)}</h1><p>Credentials are in <code>${escapeHtml(values.out)}</code>. Now install the app on your FACTORY_REPO:</p><p><a href="${escapeHtml(app.html_url)}/installations/new">${escapeHtml(app.html_url)}/installations/new</a></p></body>`
  );
  console.log(
    `Created ${app.slug}. Wrote ${values.out} (app id, slug, webhook secret, private key). Install it: ${app.html_url}/installations/new`
  );
  server.close();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${port}/ and press "Create on GitHub".`);
});
