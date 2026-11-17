// O board visual em modo real: serve dist/ e uma API pequena que escreve nos mesmos arquivos que o vk.
import http from "http";
import fs from "fs";
import path from "path";
import { load, save, history, whoami, isRepo } from "./lib/store.mjs";
import * as K from "./lib/board.mjs";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };

export function serve(root, { port = 4173, push = false, dist }) {
  let user = null;
  const snapshot = () => ({ auth: "local", ...load(root), log: history(root, 10), user, repo: isRepo(root) });
  const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
  const body = (req) => new Promise((ok, bad) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } }); });

  // Uma mudança por vez: a fila evita dois commits ao mesmo tempo.
  let queue = Promise.resolve();
  const act = (fn) => (queue = queue.then(fn, fn));

  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/api/board" && req.method === "GET") return send(res, 200, snapshot());
      if (url.pathname === "/api/login" && req.method === "POST") {
        user = whoami(root);
        return user ? send(res, 200, snapshot()) : send(res, 401, { error: "Não achei seu login. Rode gh auth login ou defina VK_USER." });
      }
      if (url.pathname === "/api/logout" && req.method === "POST") { user = null; return send(res, 200, snapshot()); }
      if (url.pathname.startsWith("/api/") && req.method === "POST") {
        if (!user) return send(res, 401, { error: "Entre com GitHub pra mexer no board." });
        const input = await body(req);
        return await act(() => {
          const state = load(root);
          const out = K.apply(state.boards, url.pathname.slice(5), input, user);
          if (out === undefined) return send(res, 404, { error: "não existe" });
          if (out) save(root, state, out.slug, { ...out, who: user, push });
          send(res, 200, snapshot());
        });
      }
      // Arquivos do board visual
      let file = path.join(dist, path.normalize(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("não existe. Rode ./build.sh antes do vk serve."); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    } catch (e) { send(res, 400, { error: e.message }); }
  }).listen(port, "127.0.0.1", () => console.log(`board em http://localhost:${port}  (${isRepo(root) ? "cada mudança vira commit" : "sem git: salva sem commit"}${push ? ", com push" : ""})`));
}
