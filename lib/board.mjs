// O modelo do board, igual no navegador, no servidor e no terminal.
// A verdade são os arquivos: boards/<quadro>/board.json (nome, prefixo, colunas, tags, fluxo)
// e boards/<quadro>/cards/<ID>.md (um por cartão). Cada quadro tem um prefixo único (VK, BZ…),
// então o id de um cartão já diz de que quadro ele é.

export function parseCard(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("cartão sem cabeçalho ---");
  const c = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) c[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  c.order = Number(c.order ?? 0);
  c.done = c.done === "true";
  // Um cartão pode ter várias tags (tags: ui, bend). Cartões antigos têm uma só (tag: ui).
  c.tags = splitTags(c.tags ?? c.tag);
  delete c.tag;
  // Um cartão pode ter várias pessoas (who: ana, leo). Cartões antigos têm uma só.
  c.who = splitWho(c.who);
  // Quem criou o cartão (by: login). Só existe nos cartões criados depois que o campo entrou; os antigos não têm.
  if (c.by) c.by = c.by.replace(/^@/, ""); else delete c.by;
  // De onde um cartão concluído saiu (coluna e ordem), pra voltar pra lá se for desmarcado.
  if (c.from) c.from_order = Number(c.from_order ?? 0); else { delete c.from; delete c.from_order; }
  // O que foi posto no cartão: as subtasks dele (cartões do mesmo quadro, em ordem), os cartões que ele espera e os ligados a ele.
  c.subs = splitIds(c.subs); c.blocked_by = splitIds(c.blocked_by); c.related = splitIds(c.related);
  const body = m[2].replace(/^\n+/, "");
  const t = /^# (.*)\n?/.exec(body);
  c.title = t ? t[1].trim() : c.id;
  // As checklists ficam no fim do texto do cartão, cada uma um título "## nome" e linhas "- [ ] item": o resto são as notas.
  const rest = splitLists((t ? body.slice(t[0].length) : body).replace(/^\n+/, "").trimEnd());
  c.notes = rest.notes; c.lists = rest.lists;
  return c;
}

// Separa as notas das checklists que vêm no fim do texto. Uma checklist só existe com pelo menos um item.
export function splitLists(text) {
  const lines = String(text ?? "").split("\n"), lists = [];
  let end = lines.length;
  for (;;) {
    let i = end - 1; while (i >= 0 && !lines[i].trim()) i--;
    const items = []; let j = i;
    while (j >= 0 && /^- \[[ xX]\] /.test(lines[j] + " ")) { items.unshift({ text: lines[j].slice(6).trim(), done: lines[j][3] !== " " }); j--; }
    if (!items.length) break;
    let k = j; while (k >= 0 && !lines[k].trim()) k--;
    if (k < 0 || !/^## \S/.test(lines[k])) break;
    lists.unshift({ name: lines[k].slice(3).trim(), items });
    end = k;
  }
  return { notes: lines.slice(0, end).join("\n").trimEnd(), lists };
}
// As checklists como vão pro arquivo: nome e itens numa linha só, e só as que têm item.
const oneLine = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const cleanLists = (lists) => (Array.isArray(lists) ? lists : []).map((l) => ({ name: oneLine(l?.name).replace(/^#+\s*/, "") || "Checklist", items: (Array.isArray(l?.items) ? l.items : []).map((it) => ({ text: oneLine(it?.text), done: !!it?.done })).filter((it) => it.text) })).filter((l) => l.items.length);

export const splitTags = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((t) => String(t).trim()).filter(Boolean);
// As tags do quadro: board.json "tags" é { tag: [áreas] }. Quadros antigos guardavam um tom ({ ui: "accent" }): sem área.
// As pessoas de um cartão: uma lista de logins do GitHub, sem @ e sem repetir.
export const splitWho = (v) => [...new Set(splitTags(v).map((w) => w.replace(/^@/, "")).filter(Boolean))];
export const tagAreas = (board, t) => (Array.isArray(board.tags?.[t]) ? board.tags[t] : []);
// Uma lista de ids de cartão (subs: GE-7, GE-8), sem repetir.
export const splitIds = (v) => [...new Set(splitTags(v).map((x) => x.toUpperCase()))];

// Um cartão sem subtasks, relações nem checklists sai igual ao que sempre saiu: as linhas novas só existem quando têm algo.
export function cardMd(c) {
  const ids = (k) => (c[k]?.length ? [`${k}: ${c[k].join(", ")}`] : []);
  const lists = cleanLists(c.lists).flatMap((l) => ["", `## ${l.name}`, "", ...l.items.map((it) => `- [${it.done ? "x" : " "}] ${it.text}`)]);
  return ["---", `id: ${c.id}`, `lane: ${c.lane}`, `who: ${splitWho(c.who).join(", ")}`, ...(c.by ? [`by: ${c.by}`] : []), `tags: ${(c.tags || []).join(", ")}`, `order: ${c.order}`, ...ids("subs"), ...ids("blocked_by"), ...ids("related"), ...(c.done ? ["done: true"] : []), ...(c.done_at ? [`done_at: ${c.done_at}`] : []), ...(c.from ? [`from: ${c.from}`, `from_order: ${c.from_order}`] : []), "---", "", `# ${c.title}`, ...(c.notes ? ["", c.notes] : []), ...lists].join("\n").trimEnd() + "\n";
}

// Feito: o cartão concluído (o círculo) ou na coluna "done". done_at é o dia em que ele virou feito (o workload da sprint usa).
export const DONE_LANE = "done";
export const isDone = (c) => !!c.done || c.lane === DONE_LANE;
const today = () => new Date().toISOString().slice(0, 10);
function stampDone(c, wasDone) { if (isDone(c) && !wasDone) c.done_at = today(); if (!isDone(c)) delete c.done_at; }

export const sorted = (cards) => [...cards].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en", { numeric: true }));
// ---------- Subtasks e relações ----------
// Uma subtask é um cartão inteiro (tem coluna, pessoas, pode ter as subtasks dela) que está na lista "subs" de outro.
// Ela não aparece solta na coluna: aparece dentro do cartão de que faz parte.
export const subIds = (cards) => new Set(cards.flatMap((c) => c.subs || []));
export const parentOf = (cards, id) => cards.find((c) => (c.subs || []).includes(id));
const pick = (cards, ids) => (ids || []).map((id) => cards.find((x) => x.id === id)).filter(Boolean);
export const subsOf = (cards, c) => pick(cards, c.subs);
// Quanto do cartão está feito: as subtasks dele e os itens das checklists. null se ele não tem nenhum dos dois.
export function progress(cards, c) {
  const xs = [...subsOf(cards, c).map(isDone), ...(c.lists || []).flatMap((l) => l.items.map((it) => !!it.done))];
  return xs.length ? [xs.filter(Boolean).length, xs.length] : null;
}
// Os cartões que este espera; os que esperam por ele; os ligados a ele (a ligação vale pros dois lados, esteja em qual arquivo estiver).
export const waitsFor = (cards, c) => pick(cards, c.blocked_by);
export const isBlocked = (cards, c) => waitsFor(cards, c).some((x) => !isDone(x));
export const blocking = (cards, c) => cards.filter((x) => (x.blocked_by || []).includes(c.id));
export const relatedOf = (cards, c) => pick(cards, [...new Set([...(c.related || []), ...cards.filter((x) => (x.related || []).includes(c.id)).map((x) => x.id)])]);

// Os cartões de uma coluna como o quadro mostra (sem as subtasks) e todos os que estão nela (pra dar o lugar de cada um).
export const inLaneAll = (cards, lane) => sorted(cards.filter((c) => c.lane === lane));
export const inLane = (cards, lane) => { const subs = subIds(cards); return sorted(cards.filter((c) => c.lane === lane && !subs.has(c.id))); };
export const laneName = (board, id) => board.lanes.find((l) => l.id === id)?.name ?? id;

export function check(board, cards) {
  const errors = [], lanes = new Set(board.lanes.map((l) => l.id)), seen = new Set();
  for (const c of cards) {
    if (seen.has(c.id)) errors.push(`${c.id}: id repetido`);
    seen.add(c.id);
    if (!lanes.has(c.lane)) errors.push(`${c.id}: coluna "${c.lane}" não existe em board.json`);
    for (const t of c.tags || []) if (!(t in board.tags)) errors.push(`${c.id}: tag "${t}" não existe em board.json`);
  }
  // Subtasks e relações apontam pra cartões que existem; uma subtask é de um cartão só, e nunca dela mesma (nem por volta).
  const owner = new Map();
  for (const c of cards) {
    for (const s of c.subs || []) {
      if (!seen.has(s) || s === c.id) errors.push(`${c.id}: a subtask ${s} não existe`);
      else if (owner.has(s)) errors.push(`${s}: é subtask de ${owner.get(s)} e de ${c.id}`);
      else owner.set(s, c.id);
    }
    for (const k of ["blocked_by", "related"]) for (const r of c[k] || []) if (!seen.has(r) || r === c.id) errors.push(`${c.id}: ${k} aponta pra ${r}, que não existe`);
  }
  for (const c of cards) { let p = owner.get(c.id), n = 0; while (p && n++ <= cards.length) { if (p === c.id) { errors.push(`${c.id}: é subtask dele mesmo`); break; } p = owner.get(p); } }
  return errors;
}

export function nextId(board, cards) {
  const n = Math.max(0, ...cards.map((c) => Number(c.id.split("-")[1]) || 0));
  return `${board.prefix}-${n + 1}`;
}

// Ordem dentro da coluna: só o cartão movido muda de número, então cada movimento mexe em um arquivo só.
function orderAt(cards, lane, before, skip) {
  const xs = inLaneAll(cards, lane).filter((c) => c.id !== skip);
  const i = before ? xs.findIndex((c) => c.id === before) : -1;
  if (i < 0) return xs.length ? Math.floor(xs[xs.length - 1].order) + 1 : 1;
  return i === 0 ? xs[0].order - 1 : (xs[i - 1].order + xs[i].order) / 2;
}

export function move(board, cards, id, lane, before = null) {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`${id} não existe`);
  if (!board.lanes.some((l) => l.id === lane)) throw new Error(`coluna "${lane}" não existe`);
  const from = c.lane, wasDone = isDone(c);
  c.order = orderAt(cards, lane, before, id);
  c.lane = lane;
  delete c.from; delete c.from_order;   // mover é escolher o lugar: o cartão esquece de onde tinha saído
  stampDone(c, wasDone);
  return { card: c, from, message: from === lane ? `board: ${id} reordenado em ${laneName(board, lane)}` : `board: ${id} ${laneName(board, from)} → ${laneName(board, lane)}` };
}

// by: quem criou o cartão (vk add, o app e as subtasks passam quem está mexendo).
const byField = (by) => (by ? { by: String(by).replace(/^@/, "") } : {});
export function add(board, cards, { title, lane, who, by, tags = [], notes = "" }) {
  lane ||= board.lanes[0].id;
  tags = splitTags(tags);
  if (!title?.trim()) throw new Error("cartão sem título");
  if (!board.lanes.some((l) => l.id === lane)) throw new Error(`coluna "${lane}" não existe`);
  for (const t of tags) if (!(t in board.tags)) throw new Error(`tag "${t}" não existe`);
  const c = { id: nextId(board, cards), lane, who: splitWho(who), ...byField(by), tags, order: orderAt(cards, lane, null), title: title.trim(), notes, subs: [], blocked_by: [], related: [], lists: [] };
  cards.push(c);
  return { card: c, message: `board: add ${c.id} ${c.title}` };
}

const get = (cards, id) => cards.find((x) => x.id === id) ?? (() => { throw new Error(`${id} não existe`); })();
// Subtasks novas de um cartão: cada título vira um cartão na primeira coluna do quadro, sem pessoa nem tag, no fim da lista dele.
export function addSubs(board, cards, parent, titles, by) {
  const p = get(cards, parent), lane = board.lanes[0].id, made = [];
  for (const t of Array.isArray(titles) ? titles : [titles]) {
    const title = String(t ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    const c = { id: nextId(board, cards), lane, who: [], ...byField(by), tags: [], order: orderAt(cards, lane, null), title, notes: "", subs: [], blocked_by: [], related: [], lists: [] };
    cards.push(c); made.push(c);
  }
  if (!made.length) throw new Error("subtask sem título");
  p.subs = [...(p.subs || []), ...made.map((c) => c.id)];
  return { made, changed: [...made, p], message: made.length === 1 ? `board: add ${made[0].id} ${made[0].title} (em ${parent})` : `board: add ${made.length} subtasks em ${parent}` };
}
// Troca a lista de subtasks de um ou mais cartões de uma vez ({ id: [ids] }): é assim que uma subtask muda de lugar ou de nível.
export function setSubs(board, cards, set) {
  const changed = [];
  for (const [id, ids] of Object.entries(set || {})) {
    const c = get(cards, id), next = splitIds(ids);
    if (next.join() !== (c.subs || []).join()) { c.subs = next; changed.push(c); }
  }
  const errors = check(board, cards);
  if (errors.length) throw new Error(errors[0]);
  return { changed, message: `board: subtasks de ${Object.keys(set || {}).join(", ")}` };
}
// Liga ou desliga uma relação entre dois cartões. kind: "blocked_by" (id espera other), "blocking" (other espera id) ou "related".
const REL_SAYS = { blocked_by: "espera", blocking: "segura", related: "ligado a" };
export function relate(board, cards, id, kind, other, on) {
  const c = get(cards, id), x = get(cards, other), changed = [];
  if (id === other) throw new Error("um cartão não se relaciona com ele mesmo");
  if (!(kind in REL_SAYS)) throw new Error(`relação "${kind}" não existe`);
  const set = (card, key, v, want) => { const has = (card[key] || []).includes(v); if (has === want) return; card[key] = want ? [...(card[key] || []), v] : card[key].filter((z) => z !== v); if (!changed.includes(card)) changed.push(card); };
  if (kind === "blocked_by") set(c, "blocked_by", other, on);
  else if (kind === "blocking") set(x, "blocked_by", id, on);
  else if (on) { if (!relatedOf(cards, c).includes(x)) set(c, "related", other, true); }
  else { set(c, "related", other, false); set(x, "related", id, false); }
  return { changed, message: `board: ${id} ${on ? "" : "não "}${REL_SAYS[kind]} ${other}` };
}

// Muda título, notas, tags, pessoas, coluna ou concluído de um cartão. Só os campos que vieram mudam. Mudar de coluna põe ele no fim da nova.
// Concluir leva o cartão pro topo do Feito (a coluna "done") e guarda de onde ele saiu (from, from_order no arquivo);
// desmarcar devolve pra lá. O lugar é o número de ordem, então a volta não depende de quem ainda está na coluna.
// Sem coluna "done" no quadro, ou já no Feito, concluir só marca. Sem origem guardada, desmarcar só desmarca.
export function update(board, cards, id, fields) {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`${id} não existe`);
  const FIELDS = ["title", "notes", "tags", "who", "lane", "done", "blocked_by", "related", "lists"];
  const next = { ...c, ...Object.fromEntries(Object.entries(fields).filter(([k, v]) => FIELDS.includes(k) && v !== undefined)) };
  next.tags = splitTags(next.tags);
  next.blocked_by = splitIds(next.blocked_by); next.related = splitIds(next.related); next.lists = cleanLists(next.lists);
  for (const r of [...next.blocked_by, ...next.related]) if (r === id || !cards.some((x) => x.id === r)) throw new Error(`${r} não existe`);
  next.title = String(next.title).trim(); next.who = splitWho(next.who); next.notes = String(next.notes ?? "").trimEnd(); next.done = next.done === true || next.done === "true";
  if (!next.title) throw new Error("cartão sem título");
  for (const t of next.tags) if (!(t in board.tags)) throw new Error(`tag "${t}" não existe`);
  if (!board.lanes.some((l) => l.id === next.lane)) throw new Error(`coluna "${next.lane}" não existe`);
  if (next.lane !== c.lane) { next.order = orderAt(cards, next.lane, null, id); delete next.from; delete next.from_order; }
  else if (next.done && !c.done && c.lane !== DONE_LANE && board.lanes.some((l) => l.id === DONE_LANE)) {
    next.from = c.lane; next.from_order = c.order;
    next.order = orderAt(cards, DONE_LANE, inLaneAll(cards, DONE_LANE)[0]?.id ?? null, id);   // no topo
    next.lane = DONE_LANE;
  } else if (!next.done && c.done && c.from) {
    if (c.lane === DONE_LANE && board.lanes.some((l) => l.id === c.from)) { next.lane = c.from; next.order = c.from_order; }
    delete next.from; delete next.from_order;
  }
  const same = { done: () => next.done === !!c.done, lists: () => JSON.stringify(next.lists) === JSON.stringify(cleanLists(c.lists)) };
  const changed = FIELDS.filter((k) => (same[k] ? !same[k]() : Array.isArray(next[k]) ? next[k].join(",") !== splitTags(c[k]).join(",") : next[k] !== c[k]));
  const wasDone = isDone(c);
  if (!("from" in next)) { delete c.from; delete c.from_order; }
  Object.assign(c, next);
  stampDone(c, wasDone);
  const message = changed.includes("done") && changed.every((k) => k === "done" || k === "lane") ? `board: ${id} ${c.done ? "concluído" : "reaberto"}` : `board: ${id} editado (${changed.join(", ") || "nada"})`;
  return { card: c, changed, message };
}

export function remove(board, cards, id) {
  const i = cards.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`${id} não existe`);
  const [c] = cards.splice(i, 1);
  // Ninguém fica apontando pra um cartão que saiu. As subtasks dele sobem pro lugar dele na lista de quem ele era subtask;
  // se ele não era subtask de ninguém, voltam a ser cartões soltos na coluna.
  const changed = [];
  for (const x of cards) {
    let touched = false;
    if ((x.subs || []).includes(id)) { const at = x.subs.indexOf(id); x.subs = [...x.subs.slice(0, at), ...(c.subs || []), ...x.subs.slice(at + 1)]; touched = true; }
    for (const k of ["blocked_by", "related"]) if ((x[k] || []).includes(id)) { x[k] = x[k].filter((z) => z !== id); touched = true; }
    if (touched) changed.push(x);
  }
  return { card: c, changed, message: `board: remove ${id} ${c.title}` };
}

// ---------- O que vai pro repositório ----------
export function mermaid(board, cards) {
  const n = (l) => `${l.id}["${l.name} · ${inLane(cards, l.id).length}"]`;
  const lines = ["flowchart TD"], named = new Set();
  const ref = (id) => { const l = board.lanes.find((x) => x.id === id); if (named.has(id)) return id; named.add(id); return n(l); };
  for (const [from, to, label] of board.flow) lines.push(`  ${ref(from)} -->${label ? `|${label}|` : ""} ${ref(to)}`);
  for (const l of board.lanes) if (!named.has(l.id)) lines.push(`  ${ref(l.id)}`);
  for (const l of board.lanes) if (l.color) lines.push(`  ${l.id}:::${l.color}`);
  return lines.join("\n");
}

// members: os membros IA (boards/members.json). Um card de IA ganha " · IA" no fim da linha.
export function boardMd(board, cards, slug, members = {}) {
  const out = [`# Board · ${board.name}`, "", `> Gerado pelo \`vk\` a cada mudança. Não edite à mão: cada cartão é um arquivo em \`boards/${slug}/cards/\`.`, "", "```mermaid", mermaid(board, cards), "```", ""];
  for (const l of board.lanes) {
    const cs = inLane(cards, l.id);
    out.push(`## ${l.name} · ${cs.length}`, "");
    if (!cs.length) out.push("_vazio_");
    // Um cartão com subtasks ou checklist mostra quanto está feito; se espera outro, diz qual. As subtasks vêm embaixo dele, com a coluna de cada uma.
    const line = (c, depth) => {
      const p = progress(cards, c), wait = waitsFor(cards, c).filter((x) => !isDone(x));
      out.push(`${"  ".repeat(depth)}- ${c.done ? "✓ " : ""}**${c.id}** ${c.title}${c.who.length ? " — " + c.who.map((w) => "@" + w).join(" ") : ""}${(c.tags || []).map((t) => ` \`${t}\``).join("")}${p ? ` · ${p[0]}/${p[1]}` : ""}${wait.length ? ` · espera ${wait.map((x) => x.id).join(", ")}` : ""}${depth ? ` · ${laneName(board, c.lane)}` : ""}${aiCard(members, c) ? " · IA" : ""}`);
      if (depth < 8) for (const s of subsOf(cards, c)) line(s, depth + 1);
    };
    for (const c of cs) line(c, 0);
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

// O que `vk status` mostra.
export function status(board, cards, { all = false } = {}) {
  const total = cards.length || 1, w = 12;
  const len = (s) => [...s].length, pad = (s, n) => s + " ".repeat(Math.max(0, n - len(s)));
  const cut = (s, n) => (len(s) > n ? [...s].slice(0, n - 1).join("") + "…" : s);
  const nw = Math.max(...board.lanes.map((l) => len(l.name)));
  const out = [];
  for (const l of board.lanes) {
    const k = inLane(cards, l.id).length, fill = Math.round((k / total) * w);
    out.push(`${pad(l.name, nw)}  ${"█".repeat(fill)}${"░".repeat(w - fill)}  ${k}`);
  }
  const show = all ? board.lanes : board.lanes.filter((l) => l.status);
  for (const l of show) {
    out.push("", l.name.toUpperCase());
    const cs = inLane(cards, l.id);
    if (!cs.length) out.push("  (vazio)");
    for (const c of cs) out.push(`${c.done ? "✓ " : "  "}${pad(c.id, 6)}${pad(cut(c.title, 38), 40)}${pad(c.who.map((w) => "@" + w).join(" "), 7)} ${(c.tags || []).join(", ")}`.trimEnd());
  }
  return out.join("\n");
}

// ---------- Vários quadros ----------
// boards: [{ slug, board, cards }], em ordem de nome.
export const byName = (boards) => [...boards].sort((a, b) => a.board.name.localeCompare(b.board.name, "pt"));
export const findBoard = (boards, slug) => boards.find((b) => b.slug === slug);
// O quadro de um cartão, pelo prefixo do id (BZ-3 → o quadro de prefixo BZ).
export const boardOf = (boards, id) => boards.find((b) => b.board.prefix.toLowerCase() === String(id).split("-")[0].toLowerCase());
export const slugify = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Quem está num quadro: uma pessoa por login, saída dos cartões (campo who), quem tem mais cartões primeiro.
// Não existe lista de membros (o boards/members.json só diz quem é IA): quem não tem cartão no quadro não aparece.
export function people(cards) {
  const n = new Map();
  for (const c of cards) for (const w of c.who) n.set(w, (n.get(w) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------- Membros IA ----------
// boards/members.json lista só os membros IA: { "login": { "name": "…", "ai": true, "github": "login-da-foto" } }.
// Gente continua sem cadastro (sai do who dos cartões). Sem o arquivo, members é {} e tudo fica como antes.
export const isAI = (members, login) => !!login && members?.[String(login).replace(/^@/, "")]?.ai === true;
// Card de IA: um membro IA criou (by). Card de gente em que a IA entrou (who) continua sendo de gente.
export const aiCard = (members, c) => isAI(members, c.by);
// Quantos cards de IA abertos cada membro IA pode ter em um quadro: o vk add avisa quando passa.
export const AI_OPEN_MAX = 5;
export const aiOpen = (members, cards, login) => cards.filter((c) => aiCard(members, c) && c.by === login && !isDone(c)).length;
export function checkMembers(members) {
  if (!members || typeof members !== "object" || Array.isArray(members)) return ["boards/members.json: tem que ser um objeto { login: { name, ai } }"];
  const errors = [], login = /^[A-Za-z0-9-]+$/;
  for (const [id, m] of Object.entries(members)) {
    const at = `boards/members.json: ${id}`;
    if (!login.test(id)) errors.push(`${at}: o login só tem letras, números e -`);
    if (!m || typeof m !== "object" || Array.isArray(m)) { errors.push(`${at}: tem que ser um objeto { name, ai }`); continue; }
    if (typeof m.name !== "string" || !m.name.trim()) errors.push(`${at}: sem name`);
    if (typeof m.ai !== "boolean") errors.push(`${at}: ai tem que ser true ou false`);
    if ("github" in m && (typeof m.github !== "string" || !login.test(m.github))) errors.push(`${at}: github tem que ser um login do GitHub`);
  }
  return errors;
}

export function checkAll(boards, members = {}) {
  const errors = [...checkMembers(members)], prefixes = new Map();
  for (const b of boards) {
    const p = b.board.prefix?.toUpperCase();
    if (!p) errors.push(`${b.slug}: board.json sem prefix`);
    else if (prefixes.has(p)) errors.push(`${b.slug}: prefixo ${p} já é de ${prefixes.get(p)}`);
    else prefixes.set(p, b.slug);
    errors.push(...check(b.board, b.cards).map((e) => `${b.slug}: ${e}`));
    for (const c of b.cards) if (!c.id.toUpperCase().startsWith(p + "-")) errors.push(`${b.slug}: ${c.id} não tem o prefixo ${p}`);
  }
  return errors;
}

// Um quadro novo: nome, prefixo, e as colunas, o fluxo e as tags de outro quadro (from) como ponto de partida.
export function newBoard(boards, { name, prefix, from }) {
  if (!name?.trim()) throw new Error("quadro sem nome");
  prefix = String(prefix || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,5}$/.test(prefix)) throw new Error("prefixo: letras maiúsculas e números, até 6 (ex.: BZ)");
  const slug = slugify(name);
  if (!slug) throw new Error("nome sem letras");
  if (findBoard(boards, slug)) throw new Error(`já existe o quadro ${slug}`);
  if (boards.some((b) => b.board.prefix.toUpperCase() === prefix)) throw new Error(`o prefixo ${prefix} já é de outro quadro`);
  const base = (from ? findBoard(boards, from) : byName(boards)[0]) ?? (() => { throw new Error(`quadro ${from} não existe`); })();
  const board = { name: name.trim(), prefix, lanes: base.board.lanes, flow: base.board.flow, tags: base.board.tags, ...(base.board.tag_areas ? { tag_areas: base.board.tag_areas } : {}) };
  const b = { slug, board, cards: [] };
  boards.push(b);
  return { created: b, message: `board: quadro ${board.name} (${prefix}) criado` };
}

// BOARDS.md: a porta de entrada no GitHub, pra IA e pro dono.
export function boardsMd(boards) {
  const out = ["# Quadros", "", "> Gerado pelo `vk` a cada mudança. Cada quadro é uma pasta em `boards/`; o prefixo do id diz o quadro.", "", "| Quadro | Prefixo | Abertos | Quem tem cartão |", "|---|---|---|---|"];
  for (const b of byName(boards)) {
    const open = b.cards.filter((c) => !c.done).length;
    out.push(`| [${b.board.name}](boards/${b.slug}/BOARD.md) | ${b.board.prefix} | ${open} | ${people(b.cards).map(([l]) => "@" + l).join(" ") || "—"} |`);
  }
  return out.join("\n") + "\n";
}

const len = (s) => [...s].length, pad = (s, n) => s + " ".repeat(Math.max(0, n - len(s))), lpad = (s, n) => " ".repeat(Math.max(0, n - len(String(s)))) + s;
const cutTo = (s, n) => (len(s) > n ? [...s].slice(0, n - 1).join("") + "…" : s);

// vk boards: uma linha por quadro.
export function boardsStatus(boards) {
  const rows = byName(boards).map((b) => {
    const lanes = b.board.lanes.filter((l) => l.status);
    return [b.board.name, b.board.prefix, String(b.cards.filter((c) => !c.done).length), ...lanes.map((l) => `${l.name} ${inLane(b.cards, l.id).length}`), people(b.cards).map(([l]) => "@" + l).join(" ")];
  });
  const nw = Math.max(6, ...rows.map((r) => len(r[0]))), pw = Math.max(7, ...rows.map((r) => len(r[1])));
  return [`${pad("QUADRO", nw)}  ${pad("PREFIXO", pw)}  ABERTOS  QUEM`, ...rows.map((r) => `${pad(r[0], nw)}  ${pad(r[1], pw)}  ${lpad(r[2], 7)}  ${r.slice(-1)[0] || "—"}${r.length > 4 ? "   (" + r.slice(3, -1).join(", ") + ")" : ""}`)].join("\n");
}

// vk who <login>: tudo de uma pessoa, em todos os quadros.
export function whoStatus(boards, login) {
  login = String(login).replace(/^@/, "");
  const out = [];
  for (const b of byName(boards)) {
    const cs = sorted(b.cards.filter((c) => c.who.includes(login)));
    if (!cs.length) continue;
    out.push(b.board.name.toUpperCase());
    for (const c of cs) out.push(`${c.done ? "✓ " : "  "}${pad(c.id, 7)}${pad(cutTo(c.title, 38), 40)}${pad(laneName(b.board, c.lane), 10)}${(c.tags || []).join(", ")}`);
  }
  return out.length ? out.join("\n") : `@${login} não tem cartão em nenhum quadro`;
}

// Uma mudança vinda do app (vk serve ou o site): o quadro sai do id do cartão, ou de input.board pra criar.
// Devolve o que gravar ({ slug, changed | removed, message }), null se nada mudou, undefined se a ação não existe.
export function apply(boards, kind, input, user) {
  const byId = () => boardOf(boards, input.id) ?? (() => { throw new Error(`${input.id}: quadro não existe`); })();
  if (kind === "add") {
    const b = findBoard(boards, input.board) ?? (() => { throw new Error(`quadro "${input.board}" não existe`); })();
    const r = add(b.board, b.cards, { title: input.title, lane: input.lane, tags: input.tags, who: user, by: user });
    return { slug: b.slug, changed: [r.card], message: r.message };
  }
  // As tags do quadro e as áreas de cada uma (a engrenagem do quadro). Uma tag que sai também sai dos cartões.
  if (kind === "tags") {
    const b = findBoard(boards, input.board) ?? (() => { throw new Error(`quadro "${input.board}" não existe`); })();
    const r = setTags(b.board, b.cards, input.tags);
    return { slug: b.slug, changed: r.changed, boardChanged: true, message: r.message };
  }
  // Subtasks novas (sub), a lista de subtasks de um ou mais cartões (subs) e as relações entre dois cartões (rel).
  if (kind === "sub") { const b = byId(); const r = addSubs(b.board, b.cards, input.id, input.titles ?? [input.title], user); return { slug: b.slug, changed: r.changed, message: r.message }; }
  if (kind === "subs") {
    const first = Object.keys(input.set || {})[0], b = boardOf(boards, first) ?? (() => { throw new Error("subs: sem cartão"); })();
    const r = setSubs(b.board, b.cards, input.set);
    return r.changed.length ? { slug: b.slug, changed: r.changed, message: r.message } : null;
  }
  if (kind === "rel") { const b = byId(); const r = relate(b.board, b.cards, input.id, input.kind, input.other, input.on !== false); return r.changed.length ? { slug: b.slug, changed: r.changed, message: r.message } : null; }
  if (!["move", "update", "remove"].includes(kind)) return undefined;
  const b = byId();
  if (kind === "move") { const r = move(b.board, b.cards, input.id, input.lane, input.before ?? null); return { slug: b.slug, changed: [r.card], message: r.message }; }
  if (kind === "update") { const r = update(b.board, b.cards, input.id, input); return r.changed.length ? { slug: b.slug, changed: [r.card], message: r.message } : null; }
  const r = remove(b.board, b.cards, input.id);
  return { slug: b.slug, removed: [r.card], changed: r.changed, message: r.message };
}

// Troca as tags de um quadro: { tag: [áreas] }. Devolve os cartões que perderam uma tag que saiu.
export function setTags(board, cards, tags) {
  const next = {};
  for (const [name, areas] of Object.entries(tags || {})) {
    const t = String(name).trim();
    if (!t) throw new Error("tag sem nome");
    if (t.includes(",")) throw new Error(`tag "${t}": sem vírgula no nome`);
    next[t] = [...new Set(splitTags(areas))];
  }
  const gone = Object.keys(board.tags || {}).filter((t) => !(t in next));
  const changed = cards.filter((c) => (c.tags || []).some((t) => gone.includes(t)));
  for (const c of changed) c.tags = c.tags.filter((t) => !gone.includes(t));
  board.tags = next;
  return { changed, message: `board: tags de ${board.name} (${Object.keys(next).join(", ") || "nenhuma"})` };
}
