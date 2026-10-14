// Local stand-ins for the cloud services phase 5 talks to, for end-to-end tests (no network needed):
//   DNS over HTTPS   GET  /dns-query?name=&type=          (records set with POST /_dns {name,type,data})
//   Vercel domains   POST /v10/projects/:p/domains, GET /v9/projects/:p/domains/:d, GET /v6/domains/:d/config, DELETE …
//   Google OIDC      GET  /authorize → redirect with a code; POST /token (checks PKCE) → signed id_token; GET /jwks
//                    (the identity returned is set with POST /_oidc {sub,email,name})
//   S3 / R2          PUT/GET /bucket/<key> (PUT requires an AWS SigV4 Authorization header)
//   GET /_log        everything that happened, for assertions;  POST /_reset  forget it all (start of each test run)
//   node tests/mock-cloud.mjs 4557
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const PORT = Number(process.argv[2] ?? 4557);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256", use: "sig" };

const dns = new Map(); // "name|TYPE" -> [data]
const codes = new Map(); // code -> {challenge, nonce, clientId, identity}
const objects = new Map(); // key -> {type, body}
const vercelGets = new Map();
let identity = { sub: "google-1", email: "owner@example.com", name: "Owner Google" };
const log = [];

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });

createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const p = url.pathname;
  const body = await readBody(req);
  log.push({ method: req.method, path: p, auth: req.headers.authorization?.slice(0, 40) ?? null });

  // ---- test controls
  if (p === "/_reset" && req.method === "POST") { dns.clear(); codes.clear(); objects.clear(); vercelGets.clear(); log.length = 0; return send(res, 200, { ok: true }); }
  if (p === "/_dns" && req.method === "POST") { const { name, type, data } = JSON.parse(body); dns.set(`${name.toLowerCase()}|${type}`, [data]); return send(res, 200, { ok: true }); }
  if (p === "/_oidc" && req.method === "POST") { identity = JSON.parse(body); return send(res, 200, { ok: true }); }
  if (p === "/_log") return send(res, 200, { log, objects: [...objects.keys()] });

  // ---- DNS over HTTPS (JSON API)
  if (p === "/dns-query") {
    const name = (url.searchParams.get("name") ?? "").toLowerCase(), type = url.searchParams.get("type");
    const code = { TXT: 16, CNAME: 5, A: 1 }[type];
    const answers = (dns.get(`${name}|${type}`) ?? []).map((d) => ({ name, type: code, TTL: 60, data: type === "TXT" ? `"${d}"` : type === "CNAME" ? `${d}.` : d }));
    return send(res, 200, { Status: 0, Answer: answers }, { "content-type": "application/dns-json" });
  }

  // ---- Vercel
  if (/^\/v10\/projects\/[^/]+\/domains$/.test(p) && req.method === "POST") return send(res, 200, { name: JSON.parse(body).name, verified: false });
  let m = p.match(/^\/v9\/projects\/[^/]+\/domains\/([^/]+)$/);
  if (m && req.method === "GET") { const n = (vercelGets.get(m[1]) ?? 0) + 1; vercelGets.set(m[1], n); return send(res, 200, { name: m[1], verified: n >= 2 }); }
  if (m && req.method === "DELETE") return send(res, 200, {});
  if (/^\/v6\/domains\/[^/]+\/config$/.test(p)) return send(res, 200, { misconfigured: false });

  // ---- OIDC
  if (p === "/jwks") return send(res, 200, { keys: [jwk] });
  if (p === "/authorize") {
    const code = randomBytes(12).toString("hex");
    codes.set(code, { challenge: url.searchParams.get("code_challenge"), nonce: url.searchParams.get("nonce"), clientId: url.searchParams.get("client_id"), identity });
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  if (p === "/token" && req.method === "POST") {
    const f = new URLSearchParams(body.toString());
    const c = codes.get(f.get("code"));
    codes.delete(f.get("code"));
    const challenge = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
    if (!c || c.challenge !== challenge || f.get("client_secret") !== "test-secret") return send(res, 400, { error: "invalid_grant" });
    const idToken = await new SignJWT({ email: c.identity.email, email_verified: true, name: c.identity.name, nonce: c.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(ORIGIN).setAudience(c.clientId).setSubject(c.identity.sub)
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    return send(res, 200, { access_token: "x", id_token: idToken, token_type: "Bearer" });
  }

  // ---- Vercel Blob (VERCEL_BLOB_API_URL=<origin>/blob)
  if (p === "/blob/" && req.method === "PUT") {
    if (!/^Bearer vercel_blob_rw_/.test(req.headers.authorization ?? "")) return send(res, 403, { error: { code: "forbidden" } });
    const pathname = url.searchParams.get("pathname");
    objects.set(`blob/${pathname}`, { type: req.headers["x-content-type"] ?? "application/octet-stream", body });
    const u = `${ORIGIN}/blobstore/${pathname}`;
    return send(res, 200, { url: u, downloadUrl: `${u}?download=1`, pathname, contentType: req.headers["x-content-type"], contentDisposition: "inline" });
  }
  m = p.match(/^\/blobstore\/(.+)$/);
  if (m && req.method === "GET") {
    const o = objects.get(`blob/${m[1]}`);
    if (!o) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": o.type, "content-length": o.body.length });
    return res.end(o.body);
  }

  // ---- S3 / R2
  m = p.match(/^\/bucket\/(.+)$/);
  if (m && req.method === "PUT") {
    if (!/^AWS4-HMAC-SHA256 Credential=testkey\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/.test(req.headers.authorization ?? "")) return send(res, 403, { error: "bad signature" });
    objects.set(m[1], { type: req.headers["content-type"], body });
    return send(res, 200, {});
  }
  if (m && (req.method === "GET" || req.method === "HEAD")) {
    const o = objects.get(m[1]);
    if (!o) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": o.type, "content-length": o.body.length });
    return res.end(req.method === "HEAD" ? undefined : o.body);
  }
  send(res, 404, { error: "unknown mock route" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock cloud on ${ORIGIN}`));
