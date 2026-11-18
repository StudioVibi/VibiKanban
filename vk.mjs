#!/usr/bin/env node
// vk: os quadros no terminal. Lê e escreve os mesmos arquivos que o board visual.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findRoot, load, save, writeMd, history, whoami } from "./lib/store.mjs";
import { cardPath, boardMdPath, INDEX } from "./lib/paths.mjs";
import * as K from "./lib/board.mjs";

const HELP = `vk: os quadros no terminal

  vk boards                          todos os quadros: abertos, o que está andando, quem tem cartão
  vk status [quadro] [--all]         um quadro: colunas, contagem e o que está andando
                                     (sem quadro: o mesmo que vk boards)
  vk who <login>                     tudo de uma pessoa, em todos os quadros
  vk show <ID>                       um cartão inteiro (o prefixo do ID diz o quadro)
  vk add "<título>" --board Q [--lane L] [--tags A,B] [--who W,X]
  vk add "<título>" --parent ID      uma subtask do cartão ID (um cartão inteiro, que aparece dentro dele)
  vk move <ID> <coluna> [--before ID]
  vk edit <ID> [--title T] [--tags A,B] [--who W,X] [--lane L] [--blocked-by A,B]
                                     --blocked-by: os cartões que este espera (vazio "" tira todos)
  vk done <ID>                       marca como concluído e leva pro topo do Feito
  vk reopen <ID>                     desmarca e devolve pra coluna de onde saiu
  vk rm <ID>
  vk board new "<nome>" --prefix P [--from Q]
                                     um quadro novo, com as colunas e tags de Q (ou do primeiro)
  vk md                              regenera os BOARD.md e o BOARDS.md sem commit
  vk check                           confere todos os quadros e os .md
  vk serve [--port 4173]             abre o board visual, que escreve aqui

  --push   depois do commit, faz pull --rebase e push (quando há remote)
  Cada quadro é uma pasta em boards/ (board.json + cards/). Cada mudança vira um commit.
  Com um quadro só, --board pode ficar de fora; VK_BOARD também escolhe o quadro.`;

const argv = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) { const k = a.slice(2); flags[k] = argv[i + 1] && !argv[i + 1].startsWith("--") && ["lane", "tag", "tags", "who", "before", "port", "title", "board", "prefix", "from", "parent", "blocked-by"].includes(k) ? argv[++i] : true; }
  else args.push(a);
}
const cmd = args.shift();
const die = (msg) => { console.error(`vk: ${msg}`); process.exit(1); };

if (!cmd || cmd === "help" || flags.help) { console.log(HELP); process.exit(0); }
let root;
try { root = findRoot(); } catch (e) { die(e.message); }
const state = load(root);
const { boards } = state;
const names = () => K.byName(boards).map((b) => b.slug).join(", ");
const pickBoard = (q) => {
  q ??= process.env.VK_BOARD ?? (boards.length === 1 ? boards[0].slug : null);
  if (!q) die(`qual quadro? use --board (${names()})`);
  const s = String(q).toLowerCase();
  return boards.find((b) => b.slug === s || b.board.name.toLowerCase() === s || b.board.prefix.toLowerCase() === s) ?? die(`quadro "${q}" não existe (${names()})`);
};
// Um cartão pelo id, em qualquer quadro: o prefixo diz qual.
const find = (id) => {
  const b = K.boardOf(boards, id) ?? die(`${id}: nenhum quadro tem o prefixo ${String(id).split("-")[0].toUpperCase()}`);
  const c = b.cards.find((x) => x.id.toLowerCase() === String(id).toLowerCase()) ?? die(`${id} não existe`);
  return { b, c };
};
const done = (r) => console.log(r.committed ? `${r.hash} commit feito` : "salvo (sem git, sem commit)");
const recent = (slug) => { const log = history(root, 3, slug); if (log.length) console.log("\nÚLTIMAS MUDANÇAS\n" + log.map((l) => "  " + l).join("\n")); };

try {
  switch (cmd) {
    case "boards": console.log(K.boardsStatus(boards)); recent(); break;
    case "status": {
      if (!args[0] && !flags.board && boards.length > 1) { console.log(K.boardsStatus(boards)); recent(); break; }
      const b = pickBoard(args[0] ?? flags.board);
      console.log(`${b.board.name.toUpperCase()} · ${b.board.prefix}\n`);
      console.log(K.status(b.board, b.cards, { all: !!flags.all }));
      recent(b.slug);
      break;
    }
    case "who": console.log(K.whoStatus(boards, args[0] ?? die("vk who <login>"))); break;
    case "show": { const { b, c } = find(args[0]); console.log(fs.readFileSync(path.join(root, cardPath(b.slug, c.id)), "utf8").trimEnd()); break; }
    case "add": {
      if (flags.parent) {
        const { b, c } = find(flags.parent);
        const r = K.addSubs(b.board, b.cards, c.id, [args.join(" ")]);
        console.log(`${r.made[0].id} em ${c.id} · ${b.board.name}`);
        done(save(root, state, b.slug, { changed: r.changed, message: r.message, who: whoami(root), push: !!flags.push }));
        break;
      }
      const b = pickBoard(flags.board);
      const who = flags.who || whoami(root) || die("não sei quem é você: use --who, VK_USER ou gh auth login");
      const r = K.add(b.board, b.cards, { title: args.join(" "), lane: flags.lane, tags: flags.tags ?? flags.tag, who });
      console.log(`${r.card.id} em ${b.board.name} · ${K.laneName(b.board, r.card.lane)}`);
      done(save(root, state, b.slug, { changed: [r.card], message: r.message, who, push: !!flags.push }));
      break;
    }
    case "move": {
      const { b, c } = find(args[0]);
      const lane = b.board.lanes.find((l) => l.id === args[1] || l.name.toLowerCase() === String(args[1]).toLowerCase()) ?? die(`coluna "${args[1]}" não existe (${b.board.lanes.map((l) => l.id).join(", ")})`);
      const r = K.move(b.board, b.cards, c.id, lane.id, flags.before ? find(flags.before).c.id : null);
      console.log(r.message.replace(/^board: /, ""));
      done(save(root, state, b.slug, { changed: [r.card], message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "edit": {
      const { b, c } = find(args[0]);
      const r = K.update(b.board, b.cards, c.id, { title: flags.title, tags: flags.tags ?? flags.tag, who: flags.who, lane: flags.lane, blocked_by: flags["blocked-by"] === true ? "" : flags["blocked-by"] });
      if (!r.changed.length) { console.log("nada mudou"); break; }
      console.log(r.message.replace(/^board: /, ""));
      done(save(root, state, b.slug, { changed: [r.card], message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "done": case "reopen": {
      const { b, c } = find(args[0]);
      const r = K.update(b.board, b.cards, c.id, { done: cmd === "done" });
      if (!r.changed.length) { console.log(cmd === "done" ? `${c.id} já está concluído` : `${c.id} não está concluído`); break; }
      console.log(r.message.replace(/^board: /, ""));
      done(save(root, state, b.slug, { changed: [r.card], message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "rm": {
      const { b, c } = find(args[0]);
      const r = K.remove(b.board, b.cards, c.id);
      console.log(`${r.card.id} removido`);
      done(save(root, state, b.slug, { removed: [r.card], changed: r.changed, message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "board": {
      if (args[0] !== "new") die('vk board new "<nome>" --prefix P [--from quadro]');
      const r = K.newBoard(boards, { name: args.slice(1).join(" "), prefix: flags.prefix, from: flags.from && pickBoard(flags.from).slug });
      console.log(`${r.created.board.name} criado em boards/${r.created.slug}/ (prefixo ${r.created.board.prefix})`);
      done(save(root, state, r.created.slug, { created: true, message: r.message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "md": writeMd(root, state); console.log("BOARD.md e BOARDS.md regenerados"); break;
    case "check": {
      const errors = K.checkAll(boards);
      if (errors.length) die("\n- " + errors.join("\n- "));
      const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), "utf8") : "");
      for (const b of boards) if (read(boardMdPath(b.slug)) !== K.boardMd(b.board, b.cards, b.slug)) die(`${boardMdPath(b.slug)} está desatualizado: rode vk md`);
      if (read(INDEX) !== K.boardsMd(boards)) die("BOARDS.md está desatualizado: rode vk md");
      console.log(`ok: ${boards.length} ${boards.length === 1 ? "quadro" : "quadros"}, ${boards.reduce((n, b) => n + b.cards.length, 0)} cartões, BOARD.md e BOARDS.md em dia`);
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
