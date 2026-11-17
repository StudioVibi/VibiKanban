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
  const body = m[2].replace(/^\n+/, "");
  const t = /^# (.*)\n?/.exec(body);
  c.title = t ? t[1].trim() : c.id;
  c.notes = (t ? body.slice(t[0].length) : body).replace(/^\n+/, "").trimEnd();
  return c;
}

export const splitTags = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((t) => String(t).trim()).filter(Boolean);
// As tags do quadro: board.json "tags" é { tag: [áreas] }. Quadros antigos guardavam um tom ({ ui: "accent" }): sem área.
export const tagAreas = (board, t) => (Array.isArray(board.tags?.[t]) ? board.tags[t] : []);

export function cardMd(c) {
  return ["---", `id: ${c.id}`, `lane: ${c.lane}`, `who: ${c.who}`, `tags: ${(c.tags || []).join(", ")}`, `order: ${c.order}`, ...(c.done ? ["done: true"] : []), ...(c.done_at ? [`done_at: ${c.done_at}`] : []), "---", "", `# ${c.title}`, "", c.notes || ""].join("\n").trimEnd() + "\n";
}

// Feito: o cartão concluído (o círculo) ou na coluna "done". done_at é o dia em que ele virou feito (o workload da sprint usa).
export const isDone = (c) => !!c.done || c.lane === "done";
const today = () => new Date().toISOString().slice(0, 10);
function stampDone(c, wasDone) { if (isDone(c) && !wasDone) c.done_at = today(); if (!isDone(c)) delete c.done_at; }

export const sorted = (cards) => [...cards].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en", { numeric: true }));
export const inLane = (cards, lane) => sorted(cards.filter((c) => c.lane === lane));
export const laneName = (board, id) => board.lanes.find((l) => l.id === id)?.name ?? id;

export function check(board, cards) {
  const errors = [], lanes = new Set(board.lanes.map((l) => l.id)), seen = new Set();
  for (const c of cards) {
    if (seen.has(c.id)) errors.push(`${c.id}: id repetido`);
    seen.add(c.id);
    if (!lanes.has(c.lane)) errors.push(`${c.id}: coluna "${c.lane}" não existe em board.json`);
    for (const t of c.tags || []) if (!(t in board.tags)) errors.push(`${c.id}: tag "${t}" não existe em board.json`);
  }
  return errors;
}

export function nextId(board, cards) {
  const n = Math.max(0, ...cards.map((c) => Number(c.id.split("-")[1]) || 0));
  return `${board.prefix}-${n + 1}`;
}

// Ordem dentro da coluna: só o cartão movido muda de número, então cada movimento mexe em um arquivo só.
function orderAt(cards, lane, before, skip) {
  const xs = inLane(cards, lane).filter((c) => c.id !== skip);
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
  stampDone(c, wasDone);
  return { card: c, from, message: from === lane ? `board: ${id} reordenado em ${laneName(board, lane)}` : `board: ${id} ${laneName(board, from)} → ${laneName(board, lane)}` };
}

export function add(board, cards, { title, lane, who, tags = [], notes = "" }) {
  lane ||= board.lanes[0].id;
  tags = splitTags(tags);
  if (!title?.trim()) throw new Error("cartão sem título");
  if (!board.lanes.some((l) => l.id === lane)) throw new Error(`coluna "${lane}" não existe`);
  for (const t of tags) if (!(t in board.tags)) throw new Error(`tag "${t}" não existe`);
  const c = { id: nextId(board, cards), lane, who, tags, order: orderAt(cards, lane, null), title: title.trim(), notes };
  cards.push(c);
  return { card: c, message: `board: add ${c.id} ${c.title}` };
}

// Muda título, notas, tags, pessoa, coluna ou concluído de um cartão. Mudar de coluna põe ele no fim da nova.
// Concluir não muda o cartão de lugar: ele fica onde está, marcado (done: true no arquivo).
export function update(board, cards, id, fields) {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`${id} não existe`);
  const next = { ...c, ...Object.fromEntries(Object.entries(fields).filter(([k, v]) => ["title", "notes", "tags", "who", "lane", "done"].includes(k) && v !== undefined)) };
  next.tags = splitTags(next.tags);
  next.title = String(next.title).trim(); next.who = String(next.who).trim().replace(/^@/, ""); next.notes = String(next.notes ?? "").trimEnd(); next.done = next.done === true || next.done === "true";
  if (!next.title) throw new Error("cartão sem título");
  if (!next.who) throw new Error("cartão sem pessoa");
  for (const t of next.tags) if (!(t in board.tags)) throw new Error(`tag "${t}" não existe`);
  if (!board.lanes.some((l) => l.id === next.lane)) throw new Error(`coluna "${next.lane}" não existe`);
  if (next.lane !== c.lane) next.order = orderAt(cards, next.lane, null, id);
  const changed = ["title", "notes", "tags", "who", "lane", "done"].filter((k) => (k === "done" ? next.done !== !!c.done : k === "tags" ? next.tags.join(",") !== (c.tags || []).join(",") : next[k] !== c[k]));
  const wasDone = isDone(c);
  Object.assign(c, next);
  stampDone(c, wasDone);
  const message = changed.length === 1 && changed[0] === "done" ? `board: ${id} ${c.done ? "concluído" : "reaberto"}` : `board: ${id} editado (${changed.join(", ") || "nada"})`;
  return { card: c, changed, message };
}

export function remove(board, cards, id) {
  const i = cards.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`${id} não existe`);
  const [c] = cards.splice(i, 1);
  return { card: c, message: `board: remove ${id} ${c.title}` };
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

export function boardMd(board, cards, slug) {
  const out = [`# Board · ${board.name}`, "", `> Gerado pelo \`vk\` a cada mudança. Não edite à mão: cada cartão é um arquivo em \`boards/${slug}/cards/\`.`, "", "```mermaid", mermaid(board, cards), "```", ""];
  for (const l of board.lanes) {
    const cs = inLane(cards, l.id);
    out.push(`## ${l.name} · ${cs.length}`, "");
    if (!cs.length) out.push("_vazio_");
    for (const c of cs) out.push(`- ${c.done ? "✓ " : ""}**${c.id}** ${c.title} — @${c.who}${(c.tags || []).map((t) => ` \`${t}\``).join("")}`);
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
    for (const c of cs) out.push(`${c.done ? "✓ " : "  "}${pad(c.id, 6)}${pad(cut(c.title, 38), 40)}@${pad(c.who, 6)}${(c.tags || []).join(", ")}`);
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
// Não existe lista de membros: quem não tem cartão no quadro não aparece.
export function people(cards) {
  const n = new Map();
  for (const c of cards) if (c.who) n.set(c.who, (n.get(c.who) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function checkAll(boards) {
  const errors = [], prefixes = new Map();
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
    const cs = sorted(b.cards.filter((c) => c.who === login));
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
    const r = add(b.board, b.cards, { title: input.title, lane: input.lane, tags: input.tags, who: user });
    return { slug: b.slug, changed: [r.card], message: r.message };
  }
  // As tags do quadro e as áreas de cada uma (a engrenagem do quadro). Uma tag que sai também sai dos cartões.
  if (kind === "tags") {
    const b = findBoard(boards, input.board) ?? (() => { throw new Error(`quadro "${input.board}" não existe`); })();
    const r = setTags(b.board, b.cards, input.tags);
    return { slug: b.slug, changed: r.changed, boardChanged: true, message: r.message };
  }
  if (!["move", "update", "remove"].includes(kind)) return undefined;
  const b = byId();
  if (kind === "move") { const r = move(b.board, b.cards, input.id, input.lane, input.before ?? null); return { slug: b.slug, changed: [r.card], message: r.message }; }
  if (kind === "update") { const r = update(b.board, b.cards, input.id, input); return r.changed.length ? { slug: b.slug, changed: [r.card], message: r.message } : null; }
  const r = remove(b.board, b.cards, input.id);
  return { slug: b.slug, removed: [r.card], message: r.message };
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
