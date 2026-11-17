// VibiKanban. Todo o visual vem da Bend-UI, inclusive board, coluna e card (bend-ui/board.js).
// As medidas deles ficam em bend-ui/BOARD.bend; o que a dona travou tem lei em bend-ui/BOARD_LAWS.bend.
import { theme, initSegmented, announce } from "./bend-ui/ui.js";
import { mountDiagram } from "./bend-ui/diagram.js";
import { codeBlock } from "./bend-ui/syntax.js";
import G from "/Users/isabellaherman/Documents/HOC/Borzoi Diagrams/borzoi/src/diagram/Graph.bend";
import { BOARD as B, initBoard } from "./bend-ui/board.js";
import SRC from "./sources.js";
import * as K from "./lib/board.mjs";
import "./kanban.css";

theme({ mode: "light" });   // sempre claro, independente do computador

const FOOT = B.card_foot_align(), SHAPE = B.board_default_shape(), ROLE = B.card_title_role(), TAG_TOP = B.card_tag_row() === "top";
const yes = (b) => b && (b === true || b.$ === "True");
const SHOW = { id: yes(B.card_shows_id()), menu: yes(B.card_shows_menu()), tag: yes(B.card_shows_tag()), who: yes(B.card_shows_who()) };
const pinned = (k) => new RegExp(`B\\.${k}\\(`).test(SRC.laws);

const array = (xs) => { const out = []; for (let p = xs; p && p.$ === "Con"; p = p.tail) out.push(p.head); return out; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (s, r = document) => r.querySelector(s);

// ---------- Estado: a mesma fonte para o time, o GitHub e o terminal ----------
// Os arquivos de board/ entram no build (sources.js). Com `vk serve`, o board lê e escreve neles de verdade.
let BOARD = JSON.parse(SRC.repo.board), cards = SRC.repo.cards.map(K.parseCard), log = [], user = null, live = false, repoFiles = {};
let LANES = BOARD.lanes, TAGS = BOARD.tags;
const laneName = (id) => K.laneName(BOARD, id);
const inLane = (id) => K.inLane(cards, id);
const mermaid = () => K.mermaid(BOARD, cards);
const boardMd = () => K.boardMd(BOARD, cards);
const cardMd = (c) => K.cardMd(c);
function terminal() {
  const out = ["$ vk status", "", K.status(BOARD, cards)];
  if (log.length) out.push("", "ÚLTIMAS MUDANÇAS", ...log.slice(0, 3).map((l) => "  " + l));
  return out.join("\n");
}
function apply(snap) {
  BOARD = snap.board; LANES = BOARD.lanes; TAGS = BOARD.tags;
  cards = snap.cards; log = snap.log; user = snap.user; repoFiles = snap.files; live = true;
}
async function api(path, input) {
  const r = await fetch(path, { method: input ? "POST" : "GET", headers: { "content-type": "application/json" }, body: input ? JSON.stringify(input) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}
// Uma mudança: no modo real o servidor escreve o arquivo e faz o commit; no protótipo fica só na página.
async function act(kind, input, say) {
  if (live) {
    try { apply(await api("/api/" + kind, input)); announce(say); }
    catch (e) { announce(e.message); }
  } else {
    const r = kind === "move" ? K.move(BOARD, cards, input.id, input.lane, input.before)
      : kind === "add" ? K.add(BOARD, cards, { ...input, who: user })
      : K.remove(BOARD, cards, input.id);
    if (kind !== "move" || r.from !== input.lane) log.unshift(`${r.message} (@${user})`);
    announce(say);
  }
  render();
}

// ---------- Página ----------
const app = $("#app");
app.innerHTML = `
<div class="doc doc--full">
  <header class="page-head">
    <h1 class="heading">VibiKanban</h1>
    <p class="lead">Um estado, três leituras: o time arrasta cartões, o repositório recebe Markdown + Mermaid, e dá pra ler tudo no GitHub ou no terminal.</p>
  </header>
  <div class="kb-bar">
    <div class="segmented segmented--slide" role="group" aria-label="Visão" id="views">
      <button aria-pressed="true" data-view="team">Time</button>
      <button aria-pressed="false" data-view="repo">Repositório</button>
      <button aria-pressed="false" data-view="term">Terminal</button>
      <button aria-pressed="false" data-view="lib">Bend-UI</button>
    </div>
    <span class="kb-bar__spacer"></span>
    <button class="btn btn--toggle btn--sm" aria-pressed="false" id="debug"><svg class="icon"><use href="#i-search"/></svg>Debug</button>
    <span id="user"></span>
  </div>
  <section class="kb-view" data-view="team"><p class="detail kb-note" id="login-note"></p><div class="board" id="board"></div></section>
  <section class="kb-view" data-view="repo" hidden>
    <p class="detail kb-note">O que aparece no GitHub. O mesmo bloco <code class="mono">mermaid</code> que o GitHub desenha sozinho, aqui desenhado pelo parser do Borzoi + o Diagram da Bend-UI.</p>
    <div class="kb-repo">
      <div class="panel">
        <div class="panel__header"><span>Arquivos</span><span class="tag tag--mono">main</span></div>
        <div class="panel__body"><div class="outline" id="files"></div></div>
      </div>
      <div class="panel">
        <div class="panel__header"><span class="mono" id="file-name">BOARD.md</span><span class="tag tag--success">gerado</span></div>
        <div class="panel__body" id="file-body"></div>
      </div>
    </div>
  </section>
  <section class="kb-view" data-view="term" hidden>
    <p class="detail kb-note">Pra quem não abre o board: <code class="mono">vk status</code> lê os mesmos arquivos. <code class="mono">cat BOARD.md</code> também funciona, é texto puro.</p>
    <div id="term"></div>
  </section>
  <section class="kb-view" data-view="lib" hidden>
    <p class="detail kb-note">O que este protótipo precisou e a lib ainda não tem. Tudo aqui já usa só tokens; aprovado, entra na Bend-UI primeiro.</p>
    <div id="lib"></div>
  </section>
</div>`;

let view = "team", file = "BOARD.md", diagram = null;
const views = $("#views");
initSegmented(views);
views.addEventListener("change", (e) => { view = e.detail.dataset.view; for (const s of app.querySelectorAll(".kb-view")) s.hidden = s.dataset.view !== view; render(); });

// ---------- Login com GitHub: com `vk serve` é o seu login do gh; no protótipo é simulado ----------
function renderUser() {
  $("#user").innerHTML = user
    ? `<span class="kb-user"><i class="dot dot--success"></i><span class="tag tag--mono">@${user}</span><button class="btn btn--plain btn--neutral btn--sm" data-logout>Sair</button></span>`
    : `<button class="btn btn--filled btn--neutral btn--sm" data-login><svg class="icon"><use href="#i-user"/></svg>Entrar com GitHub</button>`;
  const where = live ? "" : " Protótipo: as mudanças ficam só nesta página. Rode vk serve pra escrever no repositório.";
  $("#login-note").textContent = (user
    ? `Cada movimento vira um commit de @${user} em board/.`
    : "Só leitura. Entre com GitHub pra mover cartões: cada movimento vira um commit com o seu nome.") + where;
}
$("#user").addEventListener("click", (e) => {
  const login = e.target.closest("[data-login]"), logout = e.target.closest("[data-logout]");
  if (!login && !logout) return;
  if (live) api(login ? "/api/login" : "/api/logout", {}).then((s) => { apply(s); announce(user ? `Conectado como @${user}` : "Desconectado"); render(); }, (err) => announce(err.message));
  else announce("Sem servidor não tem login: rode vk serve.");
});

// ---------- Board do time ----------
const tagHtml = (c) => `<span class="tag tag--${TAGS[c.tag]}">${c.tag}</span>`;
function footHtml(c) {
  const t = SHOW.tag && !TAG_TOP ? tagHtml(c) : "", w = SHOW.who ? `<span class="detail card__who">@${c.who}</span>` : "";
  return t || w ? `<div class="card__foot">${B.card_foot_order() === "who_tag" ? w + t : t + w}</div>` : "";
}
function cardHtml(c) {
  const moves = LANES.filter((l) => l.id !== c.lane).map((l) => `<button class="menu__item" role="menuitem" data-move="${l.id}"><svg class="icon icon--sm"><use href="#i-arrow-right"/></svg><span>Mover para ${l.name}</span></button>`).join("");
  return `<article class="card${user ? "" : " is-locked"}" data-id="${c.id}" tabindex="0" aria-label="${esc(c.id + ": " + c.title)}">
    <div class="card__head">
      <span class="card__lead">${SHOW.id ? `<span class="tag tag--mono">${c.id}</span>` : ""}${SHOW.tag && TAG_TOP ? tagHtml(c) : ""}</span>
      ${SHOW.menu ? `<div class="dropdown">
        <button class="btn btn--plain btn--neutral btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Ações de ${c.id}"${user ? "" : ' aria-disabled="true"'}><svg class="icon"><use href="#i-ellipsis"/></svg></button>
        <div class="menu menu--end" role="menu" hidden>${moves}<hr class="separator"><button class="menu__item" role="menuitem" data-remove><svg class="icon icon--sm"><use href="#i-trash-2"/></svg><span>Remover</span></button></div>
      </div>` : ""}
    </div>
    <p class="${ROLE} card__title">${esc(c.title).replace(/`([^`]+)`/g, '<code class="mono">$1</code>')}</p>
    ${footHtml(c)}
  </article>`;
}
function renderBoard() {
  $("#board").innerHTML = LANES.map((l) => `
    <section class="lane" data-lane="${l.id}" aria-label="${l.name}">
      <header class="lane__head"><h2 class="group-title">${l.name}</h2><span class="tag">${inLane(l.id).length}</span></header>
      <div class="lane__cards">${inLane(l.id).map(cardHtml).join("")}</div>
      ${user ? `<div class="lane__add"><button class="btn btn--plain btn--neutral btn--sm" data-add><svg class="icon icon--sm"><use href="#i-plus"/></svg>Adicionar cartão</button></div>` : ""}
    </section>`).join("");
}
function move(id, lane, before = null) {
  const c = cards.find((x) => x.id === id); if (!c || before === id) return;
  if (c.lane === lane) { const xs = inLane(lane), i = xs.indexOf(c); if ((xs[i + 1]?.id ?? null) === (before ?? null)) return render(); }   // soltou onde estava
  act("move", { id, lane, before: before ?? null }, c.lane === lane ? `${id} reordenado` : `${id} movido para ${laneName(lane)}`);
}
const board = $("#board");
board.addEventListener("pick", (e) => {
  if (!user) return;
  const card = e.target.closest(".card"), item = e.detail;
  if (item.dataset.move) move(card.dataset.id, item.dataset.move);
  if ("remove" in item.dataset) act("remove", { id: card.dataset.id }, `${card.dataset.id} removido`);
});
board.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]"); if (!add || !user) return;
  const box = add.parentElement;
  box.innerHTML = `<input class="input input--sm" placeholder="Título do cartão, Enter salva" aria-label="Novo cartão">`;
  const input = box.firstElementChild; input.focus();
  let closed = false;
  const finish = (save) => {
    if (closed) return; closed = true;
    const t = input.value.trim();
    if (save && t) act("add", { title: t, lane: box.closest(".lane").dataset.lane }, "Cartão criado");
    else render();
  };
  input.addEventListener("keydown", (k) => { if (k.key === "Enter") finish(true); if (k.key === "Escape") finish(false); });
  input.addEventListener("blur", () => finish(true));
});
// Arrastar: vem da Bend-UI (initBoard). O cartão levanta, os outros abrem espaço e ele assenta com a mola do MOTION.bend.
initBoard(board, { canDrag: () => !!user, onDrop: (id, lane, before) => move(id, lane, before) });

// ---------- Repositório ----------
function renderRepo() {
  const files = ["BOARD.md", ...K.sorted(cards).map((c) => `board/cards/${c.id}.md`)];
  if (!files.includes(file)) file = "BOARD.md";
  $("#files").innerHTML = `
    <div class="outline__item"><div class="outline__row"><i class="dot dot--success"></i><button class="btn btn--link kb-file" data-file="BOARD.md" aria-current="${file === "BOARD.md"}">BOARD.md</button></div><p class="detail">Resumo + diagrama</p></div>
    <div class="outline__group"><h3 class="group-title">board/cards/</h3><div class="outline__kids">
      ${K.sorted(cards).map((c) => `<div class="outline__item"><div class="outline__row"><i class="dot"></i><button class="btn btn--link kb-file mono" data-file="board/cards/${c.id}.md" aria-current="${file.endsWith(c.id + ".md")}">${c.id}.md</button></div></div>`).join("")}
    </div></div>`;
  $("#file-name").textContent = file;
  const body = $("#file-body");
  diagram?.destroy(); diagram = null;
  if (file === "BOARD.md") {
    const md = boardMd();
    body.innerHTML = `<div class="segmented" role="group" aria-label="Modo" id="md-mode"><button aria-pressed="true" data-m="r">Renderizado</button><button aria-pressed="false" data-m="s">Fonte (o que a IA lê)</button></div>
      <div class="kb-md" data-m="r"><div class="prose"><h1>Board · ${esc(BOARD.name)}</h1><p>Gerado pelo <code>vk</code> a cada mudança. Cada cartão é um arquivo em <code>board/cards/</code>.</p></div>
        <div class="canvas kb-diagram"><div id="diagram"></div></div>
        <div class="prose">${LANES.map((l) => `<h2>${l.name} · ${inLane(l.id).length}</h2>${inLane(l.id).length ? `<ul>${inLane(l.id).map((c) => `<li><strong>${c.id}</strong> ${esc(c.title)} — @${c.who} <code>${c.tag}</code></li>`).join("")}</ul>` : "<p><em>vazio</em></p>"}`).join("")}</div></div>
      <div class="kb-md" data-m="s" hidden>${codeBlock(md, { lang: "markdown", name: "BOARD.md", numbers: true })}</div>`;
    const mode = $("#md-mode"); initSegmented(mode);
    mode.addEventListener("change", (e) => body.querySelectorAll(".kb-md").forEach((x) => (x.hidden = x.dataset.m !== e.detail.dataset.m)));
    const src = mermaid(), g = G.parse(src);
    const nodes = array(g.nodes), ids = new Map(nodes.map((n, i) => [n.id, i]));
    const tones = new Map(array(G.tones(src)).map((t) => [t.id, t.tone]));
    diagram = mountDiagram($("#diagram"), {
      nodes: nodes.map((n) => ({ label: n.label, tone: tones.get(n.id) ?? "" })),
      edges: array(g.edges).map((e) => ({ from: ids.get(e.from), to: ids.get(e.to), label: e.label })),
    }, { label: "Fluxo do board" });
  } else {
    const c = cards.find((x) => file.endsWith(x.id + ".md"));
    body.innerHTML = codeBlock(cardMd(c), { lang: "markdown", name: file, numbers: true });
  }
}
$("#files").addEventListener("click", (e) => { const b = e.target.closest("[data-file]"); if (b) { file = b.dataset.file; renderRepo(); } });

// ---------- Terminal ----------
const renderTerm = () => ($("#term").innerHTML = codeBlock(terminal(), { lang: "shell", name: "zsh", head: true }));

// ---------- O que ainda falta na lib (board, coluna e card já entraram: bend-ui/board.js) ----------
const NEED = [
  ["Motion de arrastar", "Levantar, linha de inserção e assentar: vai pro MOTION.bend, não pro CSS.", "MOTION.bend: lift, settle", "warning"],
  ["Teclado no board", "Mover cartão com ⌥←/→ e ⌥↑/↓ sem mouse: atalhos provados em KEYS.bend.", "KEYS.bend: card.move.*", "warning"],
  ["Ícone do GitHub", "O botão de login usa i-user por enquanto. Marca entra em brand/, como claude.webp.", "brand/github.svg", "warning"],
  ["Tabela em .prose", "BOARD.md com tabela hoje sairia sem estilo; por isso usei listas.", ".prose table", ""],
  ["Terminal", "code-block já resolve; talvez uma variante code-block--term com prompt.", "code-block--term", ""],
];
// "Nasce certo": as quatro regras que o build confere antes de gerar o bundle.
const CONTRACT = [
  ["Toda medida é um token do componente", `As regras de <code class="mono">.board</code>, <code class="mono">.lane</code> e <code class="mono">.card</code> só leem <code class="mono">--card-*</code>, <code class="mono">--lane-*</code>, <code class="mono">--board-*</code>. Nada de <code class="mono">--space-*</code> direto, nada de px.`, "bend-ui/board-check.js"],
  ["Todo valor tem lei ou está marcado", `O que você travou no Editor do card tem lei que fixa o número. O resto está no BOARD.bend com <code class="mono"># undecided</code>: aparece, mas ninguém finge que foi decidido.`, "bend-ui/board-check.js"],
  ["Todo número chega na tela", "Nenhum valor do BOARD.bend fica de fora do CSS (direto, ou pela largura que ele compõe). É o problema dos 10 tokens órfãos da lib, impedido desde o começo.", "bend-ui/board-check.js"],
  ["A prova roda no build", "Lei quebrada ou contrato quebrado: o build.sh para e não gera nada.", "bend-ui/BOARD_PROOF.bend"],
];
// A ficha: cada número medido na tela, o valor do BOARD.bend que deveria dar esse número e se ele é lei ou não decidido.
const four = (t, r, b, l) => (t === r && r === b && b === l ? t : [t, r, b, l].join(" · "));
const FICHA = [
  [".lane", "padding", "pad", () => four(B.lane_padding_top(), B.lane_padding_right(), B.lane_padding_bottom(), B.lane_padding_left()), ["lane_padding_top", "lane_padding_right", "lane_padding_bottom", "lane_padding_left"]],
  [".lane", "espaço entre cards", "gap", () => B.lane_gap(), ["lane_gap"]],
  [".lane", "largura", "w", () => B.lane_width(), ["lane_width"]],
  [".lane__head", "altura", "h", () => B.card_row(), ["card_row"]],
  [".lane__head", "recuo esquerda", "padl", () => B.lane_head_padding_left(), ["lane_head_padding_left"]],
  [".lane__head", "recuo direita", "padr", () => B.lane_head_padding_right(), ["lane_head_padding_right"]],
  [".card", "padding", "pad", () => four(B.card_padding_top(), B.card_padding_right(), B.card_padding_bottom(), B.card_padding_left()), ["card_padding_top", "card_padding_right", "card_padding_bottom", "card_padding_left"]],
  [".card", "espaço entre linhas", "gap", () => B.card_gap(), ["card_gap"]],
  [".card", "largura", "w", () => B.card_width(), ["card_width"]],
  [".card", "raio", "radius", () => B["card_radius_" + SHAPE](), ["card_radius_" + SHAPE]],
  [".card__head", "altura", "h", () => B.card_row(), ["card_row"]],
  [".card__lead", "id × tag", "gap", () => B.card_head_gap(), ["card_head_gap"]],
  [".card__foot", "altura", "h", () => B.card_row(), ["card_row"]],
  [".card__foot", "espaço entre itens", "gap", () => B.card_foot_gap(), ["card_foot_gap"]],
];
const r1 = (v) => Math.round(v * 10) / 10;
function measured(el, kind) {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect(), f = (p) => r1(parseFloat(cs[p]) || 0);
  if (kind === "pad") { const v = [f("paddingTop"), f("paddingRight"), f("paddingBottom"), f("paddingLeft")]; return v.every((x) => x === v[0]) ? v[0] : v.join(" · "); }
  if (kind === "gap") return f(cs.flexDirection === "column" ? "rowGap" : "columnGap");
  if (kind === "radius") return f("borderTopLeftRadius");
  if (kind === "padx" || kind === "padl") return f("paddingLeft");
  if (kind === "padr") return f("paddingRight");
  if (kind === "h") return r1(r.height);
  if (kind === "w") return r1(r.width);
}
function fichaRows(stage) {
  const ok = (good, yes, no, tone = "danger") => `<span class="tag tag--${good ? "success" : tone}">${good ? yes : no}</span>`;
  const state = (keys) => keys.some((k) => /^(card|lane)_width$/.test(k)) ? `<span class="tag">derivado</span>` : keys.every(pinned) ? `<span class="tag tag--success">lei</span>` : `<span class="tag tag--warning">não decidido</span>`;
  const rows = FICHA.map(([sel, prop, kind, want, keys]) => {
    const el = stage.querySelector(sel), m = measured(el, kind), w = want();
    return [sel, prop, m, `${keys.map((k) => `<code class="mono">${k}</code>`).join(" ")} = ${w}`, state(keys), ok(m === w, "bate", "não bate")];
  });
  // Composição: a tag da lib mora na linha do card e precisa caber nela.
  const tag = stage.querySelector(".card .tag:not(.tag--mono)") || stage.querySelector(".card .tag"), th = measured(tag, "h"), tx = measured(tag, "padx");
  rows.push([".card .tag", "altura", th, `≤ <code class="mono">card_row</code> = ${B.card_row()}`, `<span class="tag">composição</span>`, ok(th <= B.card_row(), "cabe", "não cabe")]);
  rows.push([".card .tag", "lados", tx, `<code class="mono">tag_padding_x</code> (Bend-UI)`, `<span class="tag">da lib</span>`, ok(false, "", "formiguinha", "warning")]);
  return rows;
}
const SCALE = new Set([0, 2, 4, 8, 12, 16, 24, 32, 48, 64]);
function stageStrip(cls, x, y, w, h, v) {
  if (w < 0.5 || h < 0.5) return "";
  return `<div class="${cls}${SCALE.has(r1(v)) ? "" : " is-off"}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${Math.max(w, h) >= 12 ? `<b>${r1(v)}</b>` : ""}</div>`;
}
function measureStage(stage) {
  const base = stage.getBoundingClientRect();
  let h = "";
  for (const el of stage.querySelectorAll(".lane, .lane > *, .lane__cards > .card, .card > *, .card__lead, .card__lead > .tag, .card__foot > *")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), f = (p) => parseFloat(cs[p]) || 0;
    const x = r.left - base.left, y = r.top - base.top, pt = f("paddingTop"), pr = f("paddingRight"), pb = f("paddingBottom"), pl = f("paddingLeft");
    h += `<div class="m-box" style="left:${x}px;top:${y}px;width:${r.width}px;height:${r.height}px"></div>`;
    h += stageStrip("m-pad", x, y, r.width, pt, pt) + stageStrip("m-pad", x, y + r.height - pb, r.width, pb, pb) + stageStrip("m-pad", x, y + pt, pl, r.height - pt - pb, pl) + stageStrip("m-pad", x + r.width - pr, y + pt, pr, r.height - pt - pb, pr);
    if (/flex|grid/.test(cs.display)) {
      const kids = [...el.children].filter((k) => getComputedStyle(k).display !== "none" && !/absolute|fixed/.test(getComputedStyle(k).position));
      for (let i = 1; i < kids.length; i++) {
        const p = kids[i - 1].getBoundingClientRect(), q = kids[i].getBoundingClientRect();
        if (q.top >= p.bottom - 0.5) h += stageStrip("m-gap", x + pl, p.bottom - base.top, r.width - pl - pr, q.top - p.bottom, q.top - p.bottom);
        else if (q.left >= p.right - 0.5 && !/space/.test(cs.justifyContent)) h += stageStrip("m-gap", p.right - base.left, Math.min(p.top, q.top) - base.top, q.left - p.right, Math.max(p.bottom, q.bottom) - Math.min(p.top, q.top), q.left - p.right);
      }
    }
  }
  stage.querySelector(".kb-layer").innerHTML = h;
}
function renderLib() {
  const sample = inLane("doing").slice(0, 2);
  $("#lib").innerHTML = `
  <div class="kb-sec">
    <h2 class="section-title">Nasce certo</h2>
    <p class="text">Os valores do board vêm do <a class="link" href="https://claude.ai/artifact/LVui8FQufjHWoVzg7pJaxi" target="_blank" rel="noopener noreferrer">Editor do card</a>. Hoje: ${SRC.laws.match(/^law /gm)?.length ?? 0} valores travados com lei, o resto marcado como não decidido. Board, coluna e card agora são da Bend-UI (<code class="mono">bend-ui/board.js</code>); as medidas e as leis ficam lá.</p>
    <div class="outline"><div class="outline__kids">${CONTRACT.map(([t, d, by]) => `<div class="outline__item"><div class="outline__row"><i class="dot dot--success"></i><span class="item-title">${t}</span><span class="tag tag--mono">${by}</span></div><p class="detail">${d}</p></div>`).join("")}</div></div>
  </div>
  <div class="kb-sec">
    <h2 class="section-title">Medido na tela: lane e card</h2>
    <div class="dbg-legend"><span class="tag tag--success">padding</span><span class="tag tag--accent">gap</span><span class="tag tag--danger">fora da escala</span></div>
    <div class="kb-spec">
      <div class="canvas kb-stage"><div class="board kb-spec-board"><section class="lane" aria-label="Exemplo"><header class="lane__head"><h2 class="group-title">Fazendo</h2><span class="tag">${sample.length}</span></header><div class="lane__cards">${sample.map(cardHtml).join("")}</div></section></div><div class="kb-layer" aria-hidden="true"></div></div>
      <div class="kb-ficha" id="ficha"></div>
    </div>
    <p class="detail">Cada linha: o número que o navegador mediu, o valor do BOARD.bend que deveria dar esse número, e se ele é lei (você travou no editor), não decidido ou derivado. A padding da tag é da Bend-UI, não do card: entra na lista da formiguinha.</p>
  </div>
  <div class="kb-sec">
    <h2 class="section-title">As leis e o contrato</h2>
    <p class="detail">Na lib, <code class="mono">bun run check</code> roda a prova (agora com <code class="mono">BOARD_PROOF.bend</code>) e o <code class="mono">board-check.js</code>. O <code class="mono">./build.sh</code> do VibiKanban roda os dois de novo; se um falhar, nada é gerado. Mudar um valor travado (por exemplo <code class="mono">card_padding_left</code>) derruba a lei dele; usar <code class="mono">--space-*</code> direto num <code class="mono">.card</code> derruba o contrato.</p>
    ${codeBlock(SRC.board, { lang: "bend", name: "BOARD.bend", numbers: true })}
    ${codeBlock(SRC.laws, { lang: "bend", name: "BOARD_LAWS.bend", numbers: true, wrap: true })}
    <details class="disclosure"><summary><svg class="icon icon--sm disclosure__chevron"><use href="#i-chevron-down"/></svg><span class="disclosure__title">board-check.js</span><span class="meta">o contrato</span></summary>${codeBlock(SRC.check, { lang: "js", name: "board-check.js", numbers: true })}</details>
  </div>
  <div class="kb-sec">
    <h2 class="section-title">Ainda falta</h2>
    <div class="outline"><div class="outline__kids">
    ${NEED.map(([t, d, cls, tone]) => `<div class="outline__item${tone ? "" : " is-off"}"><div class="outline__row"><i class="dot${tone ? " dot--" + tone : ""}"></i><span class="item-title">${t}</span><span class="tag tag--mono">${cls}</span></div><p class="detail">${d}</p></div>`).join("")}
    </div></div>
  </div>`;
  const stage = $("#lib .kb-stage");
  const draw = () => {
    measureStage(stage);
    $("#ficha").innerHTML = `<div class="kb-frow kb-fhead"><span>elemento</span><span>medida</span><span>na tela</span><span>BOARD.bend</span><span>estado</span><span></span></div>` +
      fichaRows(stage).map((r) => `<div class="kb-frow">${r.map((c, i) => `<span class="${i === 0 ? "mono" : ""}">${c}</span>`).join("")}</div>`).join("");
  };
  requestAnimationFrame(draw);
  document.fonts?.ready.then(draw);
}

function render() {
  renderUser();
  renderBoard();
  if (view === "repo") renderRepo();
  if (view === "term") renderTerm();
  if (view === "lib") renderLib();
  drawDebug();
}

// ---------- Debug: padding (verde), margem (amarelo), gap (azul), fora da escala (vermelho) ----------
const DEBUG_SEL = [
  ".page-head", ".page-head > *", ".kb-bar", ".kb-bar > *", ".kb-note",
  ".board", ".lane", ".lane > *", ".lane__head > *", ".lane__cards > .card", ".card > *", ".card__head > *", ".card__lead > *", ".card__foot > *", ".lane__add > *",
  ".kb-repo", ".kb-repo > .panel", ".panel__header", ".panel__body", ".kb-diagram", ".outline__item", ".code-block", ".kb-laws",
].join(",");
const root = getComputedStyle(document.documentElement);
const tokenMap = (names) => { const m = new Map(); for (const n of names) { const v = parseFloat(root.getPropertyValue("--" + n)); if (!Number.isNaN(v) && !m.has(v)) m.set(v, n); } return m; };
const SPACE = tokenMap(["space-0", "space-hairline", "space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-7", "space-8"]);
const SIZE = tokenMap(["control-sm", "control-md", "control-lg", "control-xl", "tag-height", "icon-sm", "icon-md", "icon-lg"]);
const RADIUS = tokenMap(["radius-xs", "radius-sm", "radius-md", "radius-lg"]);
const onScale = (v) => SPACE.has(r1(v));

let debugOn = false, hot = null, layer = null, inspect = null, raf = 0, tick = 0;
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !el.closest("[hidden]"); };
function strip(cls, x, y, w, h, v) {
  if (w < 0.5 || h < 0.5) return "";
  return `<div class="${cls}${onScale(v) ? "" : " is-off"}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${Math.min(w, h) >= 9 || Math.max(w, h) >= 16 ? `<b>${r1(v)}</b>` : ""}</div>`;
}
function boxes(el, isHot) {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el), f = (p) => parseFloat(cs[p]) || 0;
  const bt = f("borderTopWidth"), br = f("borderRightWidth"), bb = f("borderBottomWidth"), bl = f("borderLeftWidth");
  const pt = f("paddingTop"), pr = f("paddingRight"), pb = f("paddingBottom"), pl = f("paddingLeft");
  const mt = f("marginTop"), mr = f("marginRight"), mb = f("marginBottom"), ml = f("marginLeft");
  const ix = r.left + bl, iy = r.top + bt, iw = r.width - bl - br, ih = r.height - bt - bb;
  let h = `<div class="dbg-box${isHot ? " is-hot" : ""}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>`;
  h += strip("dbg-pad", ix, iy, iw, pt, pt) + strip("dbg-pad", ix, iy + ih - pb, iw, pb, pb);
  h += strip("dbg-pad", ix, iy + pt, pl, ih - pt - pb, pl) + strip("dbg-pad", ix + iw - pr, iy + pt, pr, ih - pt - pb, pr);
  if (mt) h += strip("dbg-mar", r.left, r.top - Math.max(mt, 0), r.width, Math.abs(mt), mt);
  if (mb) h += strip("dbg-mar", r.left, r.bottom, r.width, Math.abs(mb), mb);
  if (ml) h += strip("dbg-mar", r.left - Math.max(ml, 0), r.top, Math.abs(ml), r.height, ml);
  if (mr) h += strip("dbg-mar", r.right, r.top, Math.abs(mr), r.height, mr);
  if (/flex|grid/.test(cs.display)) {
    const kids = [...el.children].filter((k) => { const s = getComputedStyle(k); return s.display !== "none" && !/absolute|fixed/.test(s.position) && !k.hidden; });
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
      if (b.top >= a.bottom - 0.5) h += strip("dbg-gap", ix + pl, a.bottom, iw - pl - pr, b.top - a.bottom, b.top - a.bottom);
      else if (b.left >= a.right - 0.5 && !/space/.test(cs.justifyContent)) h += strip("dbg-gap", a.right, Math.min(a.top, b.top), b.left - a.right, Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top), b.left - a.right);
    }
  }
  return h;
}
function named(v, map, unit = true) {
  const n = r1(v), t = map.get(n);
  return t ? `${n}${unit ? "" : ""} <span class="detail">${t}</span>` : n === 0 ? "0" : `<span class="dbg-off">${n} · fora da escala</span>`;
}
function describe(el) {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el), f = (p) => parseFloat(cs[p]) || 0;
  const cls = [...el.classList].slice(0, 2).map((c) => "." + c).join("") || el.tagName.toLowerCase();
  const four = (a) => { const v = a.map(f); return v.every((x) => x === v[0]) ? named(v[0], SPACE) : v.map((x) => named(x, SPACE)).join(" · "); };
  const rows = [
    ["elemento", `<span class="mono">${esc(cls)}</span>`],
    ["tamanho", `${r1(r.width)} × ${named(r.height, SIZE)}`],
    ["padding", four(["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"])],
    ["margem", four(["marginTop", "marginRight", "marginBottom", "marginLeft"])],
  ];
  if (/flex|grid/.test(cs.display)) rows.push(["gap", cs.rowGap === cs.columnGap || cs.columnGap === "normal" ? named(parseFloat(cs.rowGap) || 0, SPACE) : `${named(parseFloat(cs.rowGap) || 0, SPACE)} / ${named(parseFloat(cs.columnGap) || 0, SPACE)}`]);
  rows.push(["fonte", `${r1(f("fontSize"))} / ${cs.lineHeight === "normal" ? "normal" : r1(f("lineHeight"))}`]);
  if (f("borderTopLeftRadius")) rows.push(["raio", named(f("borderTopLeftRadius"), RADIUS)]);
  return `<div class="panel__header"><span>Debug</span><span class="dbg-legend"><span class="tag tag--success">padding</span><span class="tag tag--warning">margem</span><span class="tag tag--accent">gap</span></span></div>
    <div class="panel__body">${rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>`;
}
function drawDebug() {
  if (!debugOn) return;
  let h = "";
  for (const el of app.querySelectorAll(DEBUG_SEL)) if (visible(el) && el !== hot) h += boxes(el, false);
  if (hot && hot.isConnected && visible(hot)) h += boxes(hot, true);
  layer.innerHTML = h;
  inspect.innerHTML = hot && hot.isConnected ? describe(hot) : `<div class="panel__header"><span>Debug</span></div><div class="panel__body"><span>dica</span><span>passe o mouse em qualquer coisa</span></div>`;
}
const schedule = () => { if (debugOn && !raf) raf = requestAnimationFrame(() => { raf = 0; drawDebug(); }); };
$("#debug").addEventListener("click", (e) => {
  debugOn = !debugOn; e.currentTarget.setAttribute("aria-pressed", String(debugOn));
  if (debugOn) {
    layer = document.createElement("div"); layer.className = "kb-debug"; layer.setAttribute("aria-hidden", "true");
    inspect = document.createElement("div"); inspect.className = "panel dbg-inspect"; inspect.setAttribute("aria-hidden", "true");
    document.body.append(layer, inspect); tick = setInterval(drawDebug, 400); drawDebug();
  } else { clearInterval(tick); layer.remove(); inspect.remove(); hot = null; }
});
document.addEventListener("pointermove", (e) => { if (!debugOn) return; const t = e.target.closest("#app *"); if (t !== hot) { hot = t; schedule(); } });
document.addEventListener("scroll", schedule, true);
addEventListener("resize", schedule);

render();

// Rodando com `vk serve`: troca o retrato do build pelos arquivos de agora.
api("/api/board").then((snap) => { apply(snap); render(); }).catch(() => {});
