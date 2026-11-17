#!/usr/bin/env node
// vk: o board no terminal. Lê e escreve os mesmos arquivos que o board visual.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findRoot, load, save, history, whoami } from "./lib/store.mjs";
import * as K from "./lib/board.mjs";

const HELP = `vk: o board no terminal

  vk status [--all]                  colunas, contagem e o que está andando
  vk show <ID>                       um cartão inteiro
  vk add "<título>" [--lane L] [--tag T] [--who W]
  vk move <ID> <coluna> [--before ID]
  vk edit <ID> [--title T] [--tag T] [--who W] [--lane L]
  vk done <ID>                       marca como concluído (fica na coluna)
  vk reopen <ID>                     desmarca
  vk rm <ID>
  vk md                              regenera BOARD.md sem commit
  vk check                           confere board.json e os cartões
  vk serve [--port 4173]             abre o board visual, que escreve aqui

  --push   depois do commit, faz pull --rebase e push (quando há remote)
  Colunas e tags ficam em board/board.json. Cada mudança vira um commit em board/.`;

const argv = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) { const k = a.slice(2); flags[k] = argv[i + 1] && !argv[i + 1].startsWith("--") && ["lane", "tag", "who", "before", "port", "title"].includes(k) ? argv[++i] : true; }
  else args.push(a);
}
const cmd = args.shift();
const die = (msg) => { console.error(`vk: ${msg}`); process.exit(1); };

if (!cmd || cmd === "help" || flags.help) { console.log(HELP); process.exit(0); }
let root;
try { root = findRoot(); } catch (e) { die(e.message); }
const state = load(root);
const { board, cards } = state;
const find = (id) => cards.find((c) => c.id.toLowerCase() === String(id).toLowerCase()) ?? die(`${id} não existe`);
const done = (r) => console.log(r.committed ? `${r.hash} commit feito` : "salvo (sem git, sem commit)");

try {
  switch (cmd) {
    case "status": {
      console.log(K.status(board, cards, { all: !!flags.all }));
      const log = history(root, 3);
      if (log.length) console.log("\nÚLTIMAS MUDANÇAS\n" + log.map((l) => "  " + l).join("\n"));
      break;
    }
    case "show": { const c = find(args[0]); console.log(fs.readFileSync(path.join(root, "board", "cards", c.id + ".md"), "utf8").trimEnd()); break; }
    case "add": {
      const who = flags.who || whoami(root) || die("não sei quem é você: use --who, VK_USER ou gh auth login");
      const r = K.add(board, cards, { title: args.join(" "), lane: flags.lane, tag: flags.tag, who });
      console.log(`${r.card.id} em ${K.laneName(board, r.card.lane)}`);
      done(save(root, state, { changed: [r.card], message: r.message, who, push: !!flags.push }));
      break;
    }
    case "move": {
      const c = find(args[0]);
      const lane = board.lanes.find((l) => l.id === args[1] || l.name.toLowerCase() === String(args[1]).toLowerCase()) ?? die(`coluna "${args[1]}" não existe (${board.lanes.map((l) => l.id).join(", ")})`);
      const r = K.move(board, cards, c.id, lane.id, flags.before ? find(flags.before).id : null);
      console.log(r.message.replace(/^board: /, ""));
      done(save(root, state, { changed: [r.card], message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "edit": {
      const c = find(args[0]);
      const r = K.update(board, cards, c.id, { title: flags.title, tag: flags.tag, who: flags.who, lane: flags.lane });
      if (!r.changed.length) { console.log("nada mudou"); break; }
      console.log(r.message.replace(/^board: /, ""));
      done(save(root, state, { changed: [r.card], message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "done": case "reopen": {
      const c = find(args[0]);
      const r = K.update(board, cards, c.id, { done: cmd === "done" });
      if (!r.changed.length) { console.log(cmd === "done" ? `${c.id} já está concluído` : `${c.id} não está concluído`); break; }
      console.log(r.message.replace(/^board: /, ""));
      done(save(root, state, { changed: [r.card], message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "rm": {
      const r = K.remove(board, cards, find(args[0]).id);
      console.log(`${r.card.id} removido`);
      done(save(root, state, { removed: [r.card], message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "md": save(root, state, {}); console.log("BOARD.md regenerado"); break;
    case "check": {
      const errors = K.check(board, cards);
      if (errors.length) die("\n- " + errors.join("\n- "));
      const md = fs.existsSync(path.join(root, "BOARD.md")) ? fs.readFileSync(path.join(root, "BOARD.md"), "utf8") : "";
      if (md !== K.boardMd(board, cards)) die("BOARD.md está desatualizado: rode vk md");
      console.log(`ok: ${cards.length} cartões, ${board.lanes.length} colunas, BOARD.md em dia`);
      break;
    }
    case "serve": {
      const { serve } = await import("./server.mjs");
      serve(root, { port: Number(flags.port) || 4173, push: !!flags.push, dist: path.join(path.dirname(fileURLToPath(import.meta.url)), "dist") });
      break;
    }
    default: die(`comando "${cmd}" não existe. vk help`);
  }
} catch (e) { die(e.message); }
