// O modelo do board, igual no navegador, no servidor e no terminal.
// A verdade são os arquivos: board/board.json (colunas, tags, fluxo) e board/cards/<ID>.md (um por cartão).

export function parseCard(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("cartão sem cabeçalho ---");
  const c = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) c[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  c.order = Number(c.order ?? 0);
  c.done = c.done === "true";
  const body = m[2].replace(/^\n+/, "");
  const t = /^# (.*)\n?/.exec(body);
  c.title = t ? t[1].trim() : c.id;
  c.notes = (t ? body.slice(t[0].length) : body).replace(/^\n+/, "").trimEnd();
  return c;
}

export function cardMd(c) {
  return ["---", `id: ${c.id}`, `lane: ${c.lane}`, `who: ${c.who}`, `tag: ${c.tag}`, `order: ${c.order}`, ...(c.done ? ["done: true"] : []), "---", "", `# ${c.title}`, "", c.notes || ""].join("\n").trimEnd() + "\n";
}

export const sorted = (cards) => [...cards].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en", { numeric: true }));
export const inLane = (cards, lane) => sorted(cards.filter((c) => c.lane === lane));
export const laneName = (board, id) => board.lanes.find((l) => l.id === id)?.name ?? id;

export function check(board, cards) {
  const errors = [], lanes = new Set(board.lanes.map((l) => l.id)), seen = new Set();
  for (const c of cards) {
    if (seen.has(c.id)) errors.push(`${c.id}: id repetido`);
    seen.add(c.id);
    if (!lanes.has(c.lane)) errors.push(`${c.id}: coluna "${c.lane}" não existe em board.json`);
    if (!(c.tag in board.tags)) errors.push(`${c.id}: tag "${c.tag}" não existe em board.json`);
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
  const from = c.lane;
  c.order = orderAt(cards, lane, before, id);
  c.lane = lane;
  return { card: c, from, message: from === lane ? `board: ${id} reordenado em ${laneName(board, lane)}` : `board: ${id} ${laneName(board, from)} → ${laneName(board, lane)}` };
}

export function add(board, cards, { title, lane, who, tag, notes = "" }) {
  lane ||= board.lanes[0].id;
  tag ||= Object.keys(board.tags)[0];
  if (!title?.trim()) throw new Error("cartão sem título");
  if (!board.lanes.some((l) => l.id === lane)) throw new Error(`coluna "${lane}" não existe`);
  if (!(tag in board.tags)) throw new Error(`tag "${tag}" não existe`);
  const c = { id: nextId(board, cards), lane, who, tag, order: orderAt(cards, lane, null), title: title.trim(), notes };
  cards.push(c);
  return { card: c, message: `board: add ${c.id} ${c.title}` };
}

// Muda título, notas, tag, pessoa, coluna ou concluído de um cartão. Mudar de coluna põe ele no fim da nova.
// Concluir não muda o cartão de lugar: ele fica onde está, marcado (done: true no arquivo).
export function update(board, cards, id, fields) {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`${id} não existe`);
  const next = { ...c, ...Object.fromEntries(Object.entries(fields).filter(([k, v]) => ["title", "notes", "tag", "who", "lane", "done"].includes(k) && v !== undefined)) };
  next.title = String(next.title).trim(); next.who = String(next.who).trim().replace(/^@/, ""); next.notes = String(next.notes ?? "").trimEnd(); next.done = next.done === true || next.done === "true";
  if (!next.title) throw new Error("cartão sem título");
  if (!next.who) throw new Error("cartão sem pessoa");
  if (!(next.tag in board.tags)) throw new Error(`tag "${next.tag}" não existe`);
  if (!board.lanes.some((l) => l.id === next.lane)) throw new Error(`coluna "${next.lane}" não existe`);
  if (next.lane !== c.lane) next.order = orderAt(cards, next.lane, null, id);
  const changed = ["title", "notes", "tag", "who", "lane", "done"].filter((k) => (k === "done" ? next.done !== !!c.done : next[k] !== c[k]));
  Object.assign(c, next);
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

export function boardMd(board, cards) {
  const out = [`# Board · ${board.name}`, "", "> Gerado pelo `vk` a cada mudança. Não edite à mão: cada cartão é um arquivo em `board/cards/`.", "", "```mermaid", mermaid(board, cards), "```", ""];
  for (const l of board.lanes) {
    const cs = inLane(cards, l.id);
    out.push(`## ${l.name} · ${cs.length}`, "");
    if (!cs.length) out.push("_vazio_");
    for (const c of cs) out.push(`- ${c.done ? "✓ " : ""}**${c.id}** ${c.title} — @${c.who} \`${c.tag}\``);
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
    for (const c of cs) out.push(`${c.done ? "✓ " : "  "}${pad(c.id, 6)}${pad(cut(c.title, 38), 40)}@${pad(c.who, 6)}${c.tag}`);
  }
  return out.join("\n");
}
