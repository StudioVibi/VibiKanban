// O board visual em modo real: serve dist/ e uma API pequena que escreve nos mesmos arquivos que o vk.
import http from "http";
import fs from "fs";
import path from "path";
import { load, save, history, whoami, isRepo } from "./lib/store.mjs";
import * as K from "./lib/board.mjs";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };

export function serve(root, { port = 4173, push = false, dist }) {
  let user = null;
  const snapshot = () => {
    const { board, cards } = load(root);
    return { auth: "local", board, cards, log: history(root, 10), user, repo: isRepo(root), files: { "BOARD.md": fs.existsSync(path.join(root, "BOARD.md")) ? fs.readFileSync(path.join(root, "BOARD.md"), "utf8") : "" } };
  };
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
          const state = load(root), { board, cards } = state;
          let r, opts;
          if (url.pathname === "/api/move") { r = K.move(board, cards, input.id, input.lane, input.before ?? null); opts = { changed: [r.card] }; }
          else if (url.pathname === "/api/add") { r = K.add(board, cards, { title: input.title, lane: input.lane, tag: input.tag, who: user }); opts = { changed: [r.card] }; }
          else if (url.pathname === "/api/update") { r = K.update(board, cards, input.id, input); if (!r.changed.length) return send(res, 200, snapshot()); opts = { changed: [r.card] }; }
          else if (url.pathname === "/api/remove") { r = K.remove(board, cards, input.id); opts = { removed: [r.card] }; }
          else return send(res, 404, { error: "não existe" });
          save(root, state, { ...opts, message: r.message, who: user, push });
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
