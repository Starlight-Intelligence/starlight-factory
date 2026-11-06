// Live execution add-on for the Mission Control page. Loaded after the page's own script and uses its
// globals (line, esc, T, stage). The routed team still animates first; then the real run streams in.
(() => {
  // The page's own "Operator key" field stores the key as mc-opkey; reads reuse it.
  const store = { get: () => { try { return localStorage.getItem("mc-opkey") || document.getElementById("opkey")?.value || ""; } catch { return ""; } } };

  const out = document.createElement("section");
  out.className = "panel";
  out.hidden = true;
  out.innerHTML = `<div><div class="eyebrow">Live run</div><h2 id="live-h">Deliverable</h2><p class="note" id="live-meta"></p></div><div id="live-body" style="font-size:14.5px;line-height:1.6"></div>`;
  stage.closest("section").after(out);

  const md = (src) => esc(src)
    .replace(/^#{1,4}\s+(.*)$/gm, '<h3 style="font-family:var(--display);font-size:22px;margin:18px 0 6px;color:var(--gold)">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^\s*[-*]\s+(.*)$/gm, "• $1")
    .replace(/\n/g, "<br>");

  const LINE = {
    plan: (e) => ["h", `plan     ${e.subtasks.length} subtasks by ${e.model}`],
    admit: (e) => ["c", `run      ${e.agent.name} → ${e.lane} · ${e.model}`],
    done: (e) => ["k", `done     ${e.agent.name} · ${(e.ms / 1000).toFixed(1)}s · ${e.where || e.lane}`],
    fail: (e) => ["r", `fail     ${e.agent.name}: ${e.error}`],
    synth: (e) => ["g", `merge    draft ${e.round} by ${e.model} · ${(e.ms / 1000).toFixed(1)}s`],
    verify: (e) => [e.verdict === "PASS" ? "k" : "g", `check    round ${e.round} by ${e.model}: ${e.verdict}`],
    error: (e) => ["r", `error    ${e.msg}`],
    receipt: (e) => ["k", `receipt  ${(e.ms / 1000).toFixed(1)}s · $${e.costUsd} metered · stored on the mission`],
  };

  window.burstFollow = (rc) => {
    if (!rc?.burst) {
      line("g", `live     not started: ${rc?.reason || "no response"}`);
      return;
    }
    const id = rc.burst.id;
    line("h", `live     mission ${id} dispatched to the Burst engine on Cloudflare`);
    let since = 0;
    const tick = async () => {
      const s = await fetch(`/api/mission/${id}?since=${since}`, { cache: "no-store", headers: { "x-mission-key": store.get() } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!s) return setTimeout(tick, 3000);
      for (const e of s.events) { const f = LINE[e.type]; if (f) line(...f(e)); }
      since = s.next;
      if (s.status === "complete" || s.status === "failed") {
        if (s.deliverable) {
          out.hidden = false;
          document.getElementById("live-meta").textContent = `${s.team.length} agents · verdict ${s.verdict} · $${(+s.costUsd).toFixed(4)} metered`;
          document.getElementById("live-body").innerHTML = md(s.deliverable);
          out.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      setTimeout(tick, 1500);
    };
    tick();
  };
})();
