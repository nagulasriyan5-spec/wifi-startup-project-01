import http from "node:http";
import crypto from "node:crypto";

const targetBaseUrl = process.env.SRIYAN_API_BASE_URL;
const routerSecret = process.env.ROUTER_INTEGRATION_SECRET;
const listenHost = process.env.SIGNING_PROXY_HOST || "127.0.0.1";
const listenPort = Number(process.env.SIGNING_PROXY_PORT || 8787);

if (!targetBaseUrl || !routerSecret) {
  console.error("Set SRIYAN_API_BASE_URL and ROUTER_INTEGRATION_SECRET.");
  process.exit(1);
}

function sign({ timestamp, method, path, rawBody }) {
  return crypto
    .createHmac("sha256", routerSecret)
    .update([timestamp, method.toUpperCase(), path, rawBody].join("."))
    .digest("hex");
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const incomingUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, targetBaseUrl);
    const timestamp = String(Date.now());
    const signature = sign({
      timestamp,
      method: req.method || "GET",
      path: targetUrl.pathname,
      rawBody,
    });

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: {
          "content-type": req.headers["content-type"] || "application/json",
          authorization: `Bearer ${routerSecret}`,
          "x-sriyan-timestamp": timestamp,
          "x-sriyan-signature": `v1=${signature}`,
        },
        body: req.method === "GET" || req.method === "HEAD" ? undefined : rawBody,
      });
      const body = await upstream.text();
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      res.end(body);
    } catch (error) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Sriyan signing proxy failed",
      }));
    }
  });
});

server.listen(listenPort, listenHost, () => {
  console.log(`Sriyan signing proxy listening on http://${listenHost}:${listenPort}`);
});
