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
  vk tick <ID> <n> [--off]           marca o item n do checklist do cartão (1 = o primeiro); --off desmarca
  vk item <ID> "<texto>" [--list L]  um item novo no checklist do cartão (no primeiro, ou na lista L, que nasce se não existir)
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
  Com um quadro só, --board pode ficar de fora; VK_BOARD também escolhe o quadro.
  Quem é você: VK_USER, senão o login do gh, senão o user.name do git.
  O add grava "by: <você>" no cartão (quem criou); o --who diz quem está no cartão.
  Membros IA ficam em boards/members.json; um cartão criado por um deles é card de IA.
  Agentes: leiam o AGENTES.md antes de usar o vk.`;

const argv = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) { const k = a.slice(2); flags[k] = argv[i + 1] && !argv[i + 1].startsWith("--") && ["lane", "tag", "tags", "who", "before", "port", "title", "board", "prefix", "from", "parent", "blocked-by", "list"].includes(k) ? argv[++i] : true; }
  else args.push(a);
}
const cmd = args.shift();
const die = (msg) => { console.error(`vk: ${msg}`); process.exit(1); };

if (!cmd || cmd === "help" || flags.help) { console.log(HELP); process.exit(0); }
let root;
try { root = findRoot(); } catch (e) { die(e.message); }
const state = load(root);
const { boards, members } = state;
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
// Um membro IA que passa do teto de cards abertos num quadro recebe um aviso (o cartão é criado mesmo assim).
const capWarn = (b, by) => {
  if (!K.isAI(members, by)) return;
  const n = K.aiOpen(members, b.cards, by);
  if (n > K.AI_OPEN_MAX) console.warn(`aviso: @${by} tem ${n} cards abertos em ${b.board.name} (o teto é ${K.AI_OPEN_MAX}). Veja o AGENTES.md: progresso vai no checklist (vk tick / vk item), não em card novo.`);
};
// Os itens de todos os checklists de um cartão, em ordem: [lista, item].
const items = (c) => (c.lists || []).flatMap((l) => l.items.map((it) => [l, it]));

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
        const { b, c } = find(flags.parent), me = whoami(root);
        const r = K.addSubs(b.board, b.cards, c.id, [args.join(" ")], me);
        console.log(`${r.made[0].id} em ${c.id} · ${b.board.name}`);
        done(save(root, state, b.slug, { changed: r.changed, message: r.message, who: me, push: !!flags.push }));
        capWarn(b, me);
        break;
      }
      const b = pickBoard(flags.board), me = whoami(root);
      const who = flags.who || me || die("não sei quem é você: use --who, VK_USER ou gh auth login");
      const r = K.add(b.board, b.cards, { title: args.join(" "), lane: flags.lane, tags: flags.tags ?? flags.tag, who, by: me });
      console.log(`${r.card.id} em ${b.board.name} · ${K.laneName(b.board, r.card.lane)}`);
      done(save(root, state, b.slug, { changed: [r.card], message: r.message, who, push: !!flags.push }));
      capWarn(b, me);
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
    // O checklist pelo terminal: o progresso de um cartão fica nele, não em cartões novos.
    case "tick": {
      const { b, c } = find(args[0]), all = items(c), n = Number(args[1]);
      if (!all.length) die(`${c.id} não tem checklist (vk item ${c.id} "<texto>" cria)`);
      if (!Number.isInteger(n) || n < 1 || n > all.length) die(`vk tick ${c.id} <n>: n vai de 1 a ${all.length}`);
      const on = !flags.off, it = all[n - 1][1];
      if (it.done === on) { console.log(`${c.id} item ${n} já está ${on ? "marcado" : "desmarcado"}`); break; }
      const lists = structuredClone(c.lists);
      lists.flatMap((l) => l.items)[n - 1].done = on;
      const r = K.update(b.board, b.cards, c.id, { lists });
      const [k, t] = K.progress(b.cards, r.card);
      const message = `board: ${c.id} item ${n} ${on ? "feito" : "reaberto"} (${k}/${t})`;
      console.log(`${message.replace(/^board: /, "")}: ${it.text}`);
      done(save(root, state, b.slug, { changed: [r.card], message, who: whoami(root), push: !!flags.push }));
      break;
    }
    case "item": {
      const { b, c } = find(args[0]), text = args.slice(1).join(" ").replace(/\s+/g, " ").trim();
      if (!text) die(`vk item ${args[0] ?? "<ID>"} "<texto>"`);
      const lists = structuredClone(c.lists || []), name = typeof flags.list === "string" ? flags.list.trim() : null;
      let l = name ? lists.find((x) => x.name.toLowerCase() === name.toLowerCase()) : lists[0];
      if (!l) lists.push((l = { name: name || "Checklist", items: [] }));
      l.items.push({ text, done: false });
      const n = lists.slice(0, lists.indexOf(l) + 1).reduce((s, x) => s + x.items.length, 0);   // o número dele no vk tick
      const r = K.update(b.board, b.cards, c.id, { lists });
      const message = `board: ${c.id} item ${n} novo em ${l.name}`;
      console.log(`${message.replace(/^board: /, "")}: ${text}`);
      done(save(root, state, b.slug, { changed: [r.card], message, who: whoami(root), push: !!flags.push }));
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
      const errors = K.checkAll(boards, members);   // os quadros e o boards/members.json
      if (errors.length) die("\n- " + errors.join("\n- "));
      const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), "utf8") : "");
      for (const b of boards) if (read(boardMdPath(b.slug)) !== K.boardMd(b.board, b.cards, b.slug, members)) die(`${boardMdPath(b.slug)} está desatualizado: rode vk md`);
      if (read(INDEX) !== K.boardsMd(boards)) die("BOARDS.md está desatualizado: rode vk md");
      const ai = Object.values(members).filter((m) => m.ai).length;
      console.log(`ok: ${boards.length} ${boards.length === 1 ? "quadro" : "quadros"}, ${boards.reduce((n, b) => n + b.cards.length, 0)} cartões, ${ai} ${ai === 1 ? "membro IA" : "membros IA"}, BOARD.md e BOARDS.md em dia`);
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
