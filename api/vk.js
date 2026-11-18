// A API do site (Vercel): o mesmo que o `vk serve` faz no computador, mas gravando no GitHub
// com o login de quem está usando. vercel.json manda todo /api/* pra cá (?route=...).
//   GET  /api/auth/login     vai pro GitHub pedir o login
//   GET  /api/auth/callback  o GitHub volta aqui; a sessão fica num cookie cifrado
//   POST /api/logout
//   GET  /api/board          todos os quadros (só com login)
//   POST /api/move | add | update | remove | tags | sub | subs | rel
// Variáveis: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET, VK_REPO (dono/nome), VK_BRANCH (main).
import crypto from "crypto";
import * as K from "../lib/board.mjs";
import * as G from "../lib/github.mjs";

const env = (k, d) => process.env[k] || d;
const SESSION = "vk_session", STATE = "vk_state", MONTH = 60 * 60 * 24 * 30;

// ---------- Sessão: {login, token} cifrado com AES-GCM; só o servidor lê ----------
const key = () => crypto.createHash("sha256").update(env("SESSION_SECRET", "")).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}
function open(s) {
  try {
    const b = Buffer.from(s, "base64url"), d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch { return null; }
}
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));
const cookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env("VK_INSECURE_COOKIE") ? "" : "; Secure"}`;

// ---------- Respostas ----------
const send = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }); res.end(JSON.stringify(body)); };
const go = (res, to, headers = {}) => { res.writeHead(302, { location: to, "cache-control": "no-store", ...headers }); res.end(); };
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  let s = ""; for await (const d of req) s += d;
  return s ? JSON.parse(s) : {};
}
const origin = (req) => env("VK_ORIGIN") || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
const snapshot = ({ boards, members }, user) => ({ auth: "github", user, boards, members: members ?? {} });

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const route = (url.searchParams.get("route") || url.pathname.replace(/^\/api\/?/, "")).replace(/^\/+|\/+$/g, "");
  const repo = env("VK_REPO", "StudioVibi/VibiKanban"), branch = env("VK_BRANCH", "main");
  const c = cookies(req), s = c[SESSION] ? open(c[SESSION]) : null;
  try {
    // Login: GitHub OAuth (com state contra CSRF).
    if (route === "auth/login") {
      const state = crypto.randomBytes(16).toString("hex");
      const q = new URLSearchParams({ client_id: env("GITHUB_CLIENT_ID", ""), redirect_uri: `${origin(req)}/api/auth/callback`, scope: env("VK_SCOPE", "public_repo"), state });
      return go(res, `${env("GITHUB_WEB", "https://github.com")}/login/oauth/authorize?${q}`, { "set-cookie": cookie(STATE, state, 600) });
    }
    if (route === "auth/callback") {
      if (!url.searchParams.get("code") || url.searchParams.get("state") !== c[STATE]) return go(res, "/?login=erro");
      const t = await fetch(`${env("GITHUB_WEB", "https://github.com")}/login/oauth/access_token`, {
        method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ client_id: env("GITHUB_CLIENT_ID"), client_secret: env("GITHUB_CLIENT_SECRET"), code: url.searchParams.get("code"), redirect_uri: `${origin(req)}/api/auth/callback` }),
      }).then((r) => r.json());
      if (!t.access_token) return go(res, "/?login=erro");
      const login = await G.user(t.access_token);
      return go(res, "/", { "set-cookie": [cookie(SESSION, seal({ login, token: t.access_token }), MONTH), cookie(STATE, "", 0)] });
    }
    if (route === "logout" && req.method === "POST") return send(res, 200, { auth: "github", user: null }, { "set-cookie": cookie(SESSION, "", 0) });

    // Sem login, a API só diz que precisa entrar.
    if (!s) return send(res, route === "board" ? 200 : 401, { auth: "github", user: null, error: "Entre com GitHub." });

    if (route === "board" && req.method === "GET") return send(res, 200, snapshot(await G.load(s.token, repo, branch), s.login));
    if (req.method === "POST" && ["move", "add", "update", "remove", "tags", "sub", "subs", "rel"].includes(route)) {
      const input = await body(req);
      const state = await G.change(s.token, repo, ({ boards }) => {
        const out = K.apply(boards, route, input, s.login);
        return out && { ...out, who: s.login };
      }, branch);
      return send(res, 200, snapshot(state, s.login));
    }
    return send(res, 404, { error: "não existe" });
  } catch (e) {
    // Token vencido ou revogado: a sessão cai e a pessoa entra de novo.
    if (e.status === 401) return send(res, 401, { auth: "github", user: null, error: "Sessão do GitHub expirou. Entre de novo." }, { "set-cookie": cookie(SESSION, "", 0) });
    if (e.status === 403 || e.status === 404 || /permission|not accessible|resource not/i.test(e.message)) return send(res, 403, { error: `Sem permissão de escrita em ${repo}. Peça acesso ao repositório.` });
    return send(res, 400, { error: e.message });
  }
}
