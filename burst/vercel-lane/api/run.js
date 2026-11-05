// Vercel burst lane: Fluid compute function calling Claude through AI Gateway.
// Auth to the gateway is the deployment's OIDC token, so no provider key exists anywhere.
export const config = { maxDuration: 60 };

const MODEL = "anthropic/claude-haiku-5.5";
const REASONING_HEADROOM = 6000;

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: true, region: process.env.VERCEL_REGION });
  if (req.headers.authorization !== `Bearer ${process.env.BURST_TOKEN}`) return res.status(401).send("unauthorized");
  const job = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const started = Date.now();
  const token = process.env.VERCEL_OIDC_TOKEN || req.headers["x-vercel-oidc-token"];
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      // Haiku 5.5 reasons before answering and those tokens count against max_tokens.
      max_tokens: (job.maxTokens ?? 700) + REASONING_HEADROOM,
      messages: [
        { role: "system", content: job.system ?? "You are a precise specialist agent. Answer the subtask only, in compact markdown." },
        { role: "user", content: job.prompt },
      ],
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ status: "failed", ms: Date.now() - started, error: body?.error?.message ?? `gateway ${r.status}` });
  const output = body.choices?.[0]?.message?.content ?? "";
  if (!output.trim()) return res.status(502).json({ status: "failed", ms: Date.now() - started, error: `empty completion (finish ${body.choices?.[0]?.finish_reason}, reasoning ${body.usage?.completion_tokens_details?.reasoning_tokens ?? "?"} tokens)` });
  res.status(200).json({
    status: "done",
    ms: Date.now() - started,
    model: MODEL,
    region: process.env.VERCEL_REGION,
    output,
    usage: body.usage,
  });
}
