// VibiKanban: o app do time. Todo o visual é da Bend-UI; este arquivo não tem CSS.
// Os dados são os quadros em boards/<quadro>/ no repositório. Com `vk serve`, cada mudança vira um commit (e um push, com --push).
// Aberto sem o servidor (num artefato, por exemplo), mostra o retrato do build e as mudanças ficam só na página.
import { theme, initSegmented, announce, avatar as libAvatar, avatars as libAvatars } from "./bend-ui/ui.js";
import { createDialog } from "./bend-ui/workspace.js";   // o .dialog da lib
import { card as CARD, initBoard, cardCheck, itemCheck, newCard, fitField, formCard, cardDialog, moveCard, checkTime } from "./bend-ui/board.js";
import SRC from "./sources.js";
import * as K from "./lib/board.mjs";
import AREAS from "./workload/areas.js";
import WL from "./workload/WORKLOAD.bend";
import { mountWheel, loadBar, loadKey, areaColor, skillColor } from "./workload/workload.js";
// A Allo mora aqui no repositório (fonts/allo, licença OFL): não depende de nenhum site de fontes.
import allo from "./fonts/allo/AlloVariable.woff2";
import "./shelf.css";   // a seta que mostra as colunas guardadas

const ALLO = { family: "Allo", src: allo, weight: "100 900" };
theme({ mode: "light", fontSans: ALLO, fontDisplay: ALLO });   // sempre claro, independente do computador

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- Estado ----------
let BOARDS = SRC.repo.boards.map((b) => ({ slug: b.slug, board: JSON.parse(b.board), cards: b.cards.map(K.parseCard) }));
// Os membros IA (boards/members.json): { login: { name, ai, github? } }. Gente não está aqui.
let MEMBERS = SRC.repo.members ?? {};
let user = null, live = false, auth = null;
// O quadro aberto: o da URL (?quadro=), senão o primeiro por nome. BOARD e cards são os dele.
// O da URL fica guardado até ele existir: o retrato do build pode não ter um quadro que o servidor tem.
let want = new URLSearchParams(location.search).get("quadro"), cur = null, BOARD, cards;
function select(slug) {
  const b = K.findBoard(BOARDS, slug) ?? K.findBoard(BOARDS, cur) ?? K.byName(BOARDS)[0];
  cur = b.slug; BOARD = b.board; cards = b.cards;
  if (cur === want) want = null;
}
select(want);
const inLane = (id) => K.inLane(cards, id);
const laneName = (id) => K.laneName(BOARD, id);

// again: quantas vezes tentar de novo se a rede cair ou o servidor falhar (só pro que pode repetir sem dano, como editar um cartão).
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function api(path, input, again = 0) {
  let r;
  for (let i = 0; ; i++) {
    try {
      r = await fetch(path, { method: input ? "POST" : "GET", headers: { "content-type": "application/json" }, body: input ? JSON.stringify(input) : undefined });
      if (r.status < 500 || i >= again) break;
    } catch (e) { if (i >= again) throw new Error("Sem conexão: a mudança não foi salva."); }
    await wait(800 * (i + 1));
  }
  const j = await r.json().catch(() => ({ error: `Erro ${r.status} no servidor.` }));
  if (r.status === 401) user = null;   // a sessão caiu: volta pro botão de entrar
  if (!r.ok) throw new Error(j.error);
  return j;
}
// auth: "github" no site (login de verdade, grava no GitHub); "local" com o vk serve no computador.
function apply(snap) { if (snap.boards) { BOARDS = snap.boards; select(want ?? cur); } if (snap.members) MEMBERS = snap.members; user = snap.user; auth = snap.auth; live = true; }

// Uma mudança: aparece na tela na hora; o servidor grava o arquivo e faz o commit por trás.
// As mudanças vão pro servidor uma de cada vez, na ordem; a resposta só redesenha quando não tem outra na fila.
// Se der erro, volta pro que o servidor tem. Sem servidor, fica só na página.
// keep: a mudança já está na tela (concluir), então não redesenha.
let queue = Promise.resolve(), waiting = 0;
const files = (bs) => JSON.stringify(bs.map((b) => [b.slug, b.board, b.cards.map(K.cardMd)]));   // os quadros como ficam nos arquivos
const typing = () => !!board.querySelector(".lane__add .card__field");   // não apaga um cartão novo que está sendo escrito
function act(kind, input, said, keep = false) {
  const before = structuredClone(BOARDS);
  try { K.apply(BOARDS, kind, input, user); select(cur); }
  catch (e) { BOARDS = before; select(cur); announce(e.message); return render(); }
  if (!keep) render();
  if (!live) return announce(said);
  waiting++;
  return queue = queue.then(() => api("/api/" + kind, input, kind === "update" ? 2 : 0))
    .then((snap) => {
      // Só redesenha se o servidor trouxe algo diferente do que já está na tela (não corta a animação do cartão novo).
      if (--waiting === 0) { const same = !!snap.boards && files(snap.boards) === files(BOARDS); apply(snap); if (!keep && !same && !typing()) { render(); drawPieces(); } }
      announce(said);
    },
      (e) => { waiting--; BOARDS = before; select(cur); announce(e.message); render(); drawPieces(); api("/api/board").then((s) => { apply(s); render(); drawPieces(); }).catch(() => {}); });
}

// ---------- Página ----------
const app = $("#app");
// Sem login: só o botão do GitHub no meio da tela. Com login: a barra e o board.
app.innerHTML = `
<div class="page-center" id="gate"><button class="btn btn--filled btn--neutral" data-login><svg class="icon"><use href="#i-user"/></svg>Entrar com GitHub</button></div>
<div class="doc doc--full" id="main" hidden>
  <div id="bar"></div>
  <div class="board" id="board"></div>
  <div class="workload" id="workload" hidden><div class="workload__side" id="wl-side"></div><div id="wl-wheel"></div></div>
  <div class="toolbar toolbar--float toolbar--dock" role="toolbar" aria-label="Quadro" id="dock"></div>
</div>
<dialog class="dialog" id="card-dialog"></dialog>
<dialog id="tags-dialog"><header class="dialog__header"><h2 class="section-title" id="tags-title"></h2><button type="button" class="btn btn--ghost btn--sm btn--icon" id="tags-close" aria-label="Fechar"><svg class="icon"><use href="#i-x"/></svg></button></header><div class="dialog__body" id="tags-body"></div></dialog>`;

const board = $("#board");
const dialogEl = $("#card-dialog"), dialog = cardDialog(dialogEl);   // o cartão aberto (a ficha) da lib

function renderHead() {
  // O cabeçalho do quadro (.board__head da lib): o nome do quadro à esquerda; à direita a foto do GitHub de quem
  // está conectado, que abre o menu com o @ e Sair. A linha embaixo é o .separator.
  $("#bar").innerHTML = `<div class="board__head"><h1 class="section-title">${esc(BOARD.name)}</h1><div class="toolbar__spacer"></div>
    <button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon" data-tags-open aria-label="Tags do quadro" title="Tags do quadro"><svg class="icon icon--sm"><use href="#i-settings"/></svg></button>
    <div class="dropdown"><button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon btn--round" aria-haspopup="menu" aria-expanded="false" aria-label="@${esc(user)}">${avatar(photo(user))}</button>
      <div class="menu menu--end" role="menu" hidden><div class="menu__head"><span class="detail">@${esc(user)}</span></div><hr class="separator"><button type="button" class="menu__item" role="menuitem" data-logout><span>Sair</span></button></div></div>
  </div><hr class="separator">`;
}
app.addEventListener("click", async (e) => {
  const login = e.target.closest("[data-login]"), logout = e.target.closest("[data-logout]");
  if (!login && !logout) return;
  if (login && auth === "github") return void (location.href = "/api/auth/login");   // o GitHub pede o login e volta
  if (live) { try { apply(await api(login ? "/api/login" : "/api/logout", {})); } catch (err) { return announce(err.message); } }
  else return announce("Sem servidor não tem login: rode vk serve.");
  announce(user ? `Conectado como @${user}` : "Desconectado");
  render();
});

// ---------- Board ----------
const CHECK = { mark: "Marcar como concluído", unmark: "Desmarcar" };
// As tags de um cartão, na cor das áreas delas (a mesma da roda do Workload).
const tagColor = (t) => { const as = K.tagAreas(BOARD, t).filter((a) => AREA[a]); return as.length ? skillColor(as.map((a) => [areaColor(AREA[a].color), 1])) : NONE(); };
const tagPill = (t) => `<span class="tag-pill" style="--skill:${tagColor(t)}">${esc(t)}</span>`;
const tagHtml = (c) => (c.tags || []).map(tagPill).join("");
function cardHtml(c) {
  const S = CARD.shows;
  const tagTop = S.tag && CARD.tagOnTop ? tagHtml(c) : "", tagFoot = S.tag && !CARD.tagOnTop ? tagHtml(c) : "";
  // Quem está no cartão: as fotos do GitHub (os .avatars da lib). O @ de cada um aparece ao passar o mouse na foto.
  const who = S.who && c.who.length ? avatars(c.who.map(photo)) : "";
  // O que foi posto no cartão aparece na frente dele: quanto das subtasks e checklists está feito (no começo do rodapé)
  // e um cadeado ao lado do número enquanto ele espera um cartão que não terminou.
  const p = K.progress(cards, c), count = p ? `<span class="tag card__count" title="Subtasks e itens feitos">${ICON("list")}${p[0]}/${p[1]}</span>` : "";
  const waits = K.waitsFor(cards, c).filter((x) => !K.isDone(x)), lock = waits.length ? `<span class="tag tag--warning" title="Esperando por ${waits.map((x) => x.id).join(", ")}">${ICON("lock")}</span>` : "";
  // Card de IA (criado por um membro IA, campo by): o tom accent da lib no card e o ícone ao lado do número.
  // Card de gente em que a IA entrou continua de gente: só a foto dela é a de IA.
  const ai = K.aiCard(MEMBERS, c), aiTag = ai ? `<span class="tag tag--accent" title="Criado por ${esc(MEMBERS[c.by].name)} (IA)">${ICON("wand-sparkles")}</span>` : "";
  // Uma subtask diz de que cartão ela é, ao lado do número dela (a tag neutra da lib, discreta).
  const up = K.parentOf(cards, c.id), upTag = up ? `<span class="tag tag--mono" title="Subtask de ${up.id}">↳ ${up.id}</span>` : "";
  const foot = count || who || tagFoot ? `<div class="card__foot">${count}${CARD.footOrder === "who_tag" ? who + tagFoot : tagFoot + who}</div>` : "";
  const moves = BOARD.lanes.filter((l) => l.id !== c.lane).map((l) => `<button class="menu__item" role="menuitem" data-move="${l.id}"><svg class="icon icon--sm"><use href="#i-arrow-right"/></svg><span>Mover para ${esc(l.name)}</span></button>`).join("");
  return `<article class="card${c.done ? " is-done" : ""}"${ai ? ' data-tone="accent"' : ""} data-id="${c.id}" tabindex="0" aria-label="${esc(c.id + ": " + c.title)}">
    <div class="card__head">
      <span class="card__lead">${S.id ? `<span class="tag tag--mono">${c.id}</span>` : ""}${upTag}${aiTag}${lock}${tagTop}</span>
      ${S.menu ? `<div class="dropdown">
        <button class="btn btn--plain btn--neutral btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Ações de ${c.id}"><svg class="icon"><use href="#i-ellipsis"/></svg></button>
        <div class="menu menu--end" role="menu" hidden><button class="menu__item" role="menuitem" data-open><svg class="icon icon--sm"><use href="#i-pencil"/></svg><span>Abrir</span></button>${moves}<hr class="separator"><button class="menu__item" role="menuitem" data-remove><svg class="icon icon--sm"><use href="#i-trash-2"/></svg><span>Remover</span></button></div>
      </div>` : ""}
    </div>
    <p class="${CARD.titleRole} card__title">${cardCheck(c.done, { labels: CHECK })}${esc(c.title).replace(/`([^`]+)`/g, '<code class="mono">$1</code>')}</p>
    ${foot}
  </article>`;
}
const laneHtml = (l, tab = "") => `
    <section class="lane" data-lane="${l.id}" aria-label="${esc(l.name)}">${tab}
      <header class="lane__head"><h2 class="group-title">${esc(l.name)}</h2><span class="tag">${inLane(l.id).length}</span></header>
      <div class="lane__cards">${inLane(l.id).map(cardHtml).join("")}</div>
      <div class="lane__add"><button class="btn btn--plain btn--neutral btn--sm" data-add><svg class="icon icon--sm"><use href="#i-plus"/></svg>Adicionar cartão</button></div>
    </section>`;
// As colunas guardadas (Brainstorm, Refinamentos) ficam à esquerda do Backlog, escondidas; um botãozinho com uma seta, na margem esquerda do quadro, mostra e esconde.
// A seta abre e fecha; aberto ou fechado fica lembrado neste navegador. Aberta, elas são colunas como as outras (arrastar, adicionar).
const SHELF_KEY = "vk-shelf-open";
let shelfOpen = (() => { try { return localStorage.getItem(SHELF_KEY) === "1"; } catch { return false; } })();
function renderBoard() {
  const shelf = BOARD.lanes.filter((l) => l.shelf), rest = BOARD.lanes.filter((l) => !l.shelf);
  const what = shelf.map((l) => l.name).join(" e ");
  const tab = shelf.length ? `<button type="button" class="btn btn--plain btn--neutral btn--sm shelf-tab" data-shelf aria-expanded="${shelfOpen}" aria-label="${shelfOpen ? "Esconder" : "Mostrar"} ${what}" title="${shelfOpen ? "Esconder" : "Mostrar"} ${what}">${ICON(shelfOpen ? "chevron-left" : "chevron-right")}</button>` : "";
  // A seta mora na primeira coluna da tela (fechado: o Backlog; aberto: o Brainstorm), desenhada na margem à esquerda dela:
  // não empurra nada e fica sempre no mesmo lugar, então abrir e fechar é clicar de novo sem mexer o mouse.
  board.innerHTML = [...(shelfOpen ? shelf : []), ...rest].map((l, i) => laneHtml(l, i ? "" : tab)).join("");
  fitBoard();
}
// O quadro tem a altura da tela: do cabeçalho até logo acima do menu flutuante. A página não rola; cada coluna comprida
// rola por dentro (shelf.css) e a barra de rolar pros lados fica embaixo do quadro, acima do menu.
// Com as colunas guardadas abertas, as colunas estreitam até LANE_MIN pra caber tudo na tela; menos que isso, rola pros lados.
const LANE_MIN = 240;   // px: a coluna mais estreita antes de rolar pros lados: não decidido
function fitBoard() {
  board.style.height = ""; board.style.removeProperty("--lane-width");
  if (board.hidden || document.documentElement.hasAttribute("data-narrow")) return;
  const dock = $("#dock").getBoundingClientRect(), gap = innerHeight - dock.bottom;   // a margem do menu até o fim da tela
  board.style.height = `${Math.max(240, Math.floor(dock.top - gap - board.getBoundingClientRect().top))}px`;
  if (!shelfOpen) return;
  const cs = getComputedStyle(board), n = board.querySelectorAll(":scope > .lane").length;
  const room = board.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), g = parseFloat(cs.columnGap) || 0;
  const want = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lane-width"));
  const fit = Math.floor((room - g * (n - 1)) / n);
  if (fit < want) board.style.setProperty("--lane-width", `${Math.max(LANE_MIN, fit)}px`);
}
addEventListener("resize", () => { if (view === "board") fitBoard(); });
// Arrastando um cartão perto do alto ou do fim de uma coluna que rola, ela rola junto (a lib só rola pros lados).
let laneRoll = 0, laneAt = null;
board.addEventListener("pointermove", (e) => { laneAt = e; if (board.classList.contains("is-dragging") && !laneRoll) laneRoll = requestAnimationFrame(rollLane); });
function rollLane() {
  laneRoll = 0;
  if (!board.classList.contains("is-dragging") || !laneAt) return;
  const list = [...board.querySelectorAll(".lane__cards")].find((l) => { const r = l.getBoundingClientRect(); return laneAt.clientX >= r.left && laneAt.clientX <= r.right; });
  if (!list) return;
  const r = list.getBoundingClientRect(), edge = 56, max = 14;
  const step = laneAt.clientY < r.top + edge ? -max * (1 - Math.max(0, laneAt.clientY - r.top) / edge) : laneAt.clientY > r.bottom - edge ? max * (1 - Math.max(0, r.bottom - laneAt.clientY) / edge) : 0;
  if (Math.round(step) === 0) return;
  const before = list.scrollTop; list.scrollTop += step;
  if (list.scrollTop !== before) laneRoll = requestAnimationFrame(rollLane);
}
// ---------- Menu flutuante: o quadro aberto e "Mudar de quadro" ----------
// A lista é o .menu da lib; data-open="hover" abre no hover e data-motion="rise" faz as linhas subirem
// uma depois da outra. Cada quadro mostra as fotos do GitHub de quem tem cartão nele.
const HEADS_MAX = 3;   // quantas fotos antes do +N: não decidido
// A foto de alguém: a do GitHub. Membro IA não busca foto do GitHub (o login dele pode ser de outra pessoa lá)
// até ter o campo github no members.json; até lá é a inicial, no tom accent (.avatar--accent da lib).
// Um membro IA com avatar (arquivo em avatars/, copiado pro dist/ no build) usa essa foto; se ela falhar, a lib volta à inicial.
const ghPhoto = (login) => `https://github.com/${encodeURIComponent(login)}.png?size=48`;
const photo = (login) => {
  if (!K.isAI(MEMBERS, login)) return { name: login, src: ghPhoto(login) };
  const m = MEMBERS[login];
  return { name: login, src: m.avatar || (m.github ? ghPhoto(m.github) : null), ai: true };
};
// O avatar/avatars da lib, com o tom de IA em quem é membro IA. Cada .avatar sai com title="login", que diz de quem é.
const aiTone = (html, people) => people.filter((p) => p.ai).reduce((h, p) => h.replace(`<span class="avatar" title="${esc(p.name)}">`, `<span class="avatar avatar--accent" title="${esc(p.name)}">`), html);
const avatar = (p) => aiTone(libAvatar(p), [p]);
const avatars = (people, opts) => aiTone(libAvatars(people, opts), people);
function renderDock() {
  const items = K.byName(BOARDS).map((b) => `<button type="button" class="menu__item" role="menuitemradio" data-slug="${b.slug}" aria-checked="${b.slug === cur}"><span>${esc(b.board.name)}</span>${avatars(K.people(b.cards).map(([l]) => photo(l)), { max: HEADS_MAX })}<svg class="icon icon--sm menu__check" aria-hidden="true"><use href="#i-check"/></svg></button>`).join("");
  $("#dock").innerHTML = `
    <div class="segmented" data-manual role="group" aria-label="Visão"><button type="button" data-view="board" aria-pressed="${view === "board"}"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-columns-2"/></svg><span>${esc(BOARD.name)}</span></button><button type="button" data-view="workload" aria-pressed="${view === "workload"}"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-scale"/></svg><span>Workload</span></button></div>
    <div class="dropdown" data-open="hover" id="boards"><button type="button" class="btn btn--plain btn--neutral btn--sm" aria-haspopup="menu" aria-expanded="false"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-arrow-up-down"/></svg><span>Mudar de quadro</span></button>
      <div class="menu menu--up" data-motion="rise" role="menu" aria-label="Quadros" hidden>${items}</div></div>`;
}
$("#dock").addEventListener("pick", (e) => {
  const slug = e.detail.dataset.slug; if (!slug || slug === cur) return;
  select(slug);
  const u = new URL(location.href); u.searchParams.set("quadro", cur); history.replaceState(null, "", u);
  announce(`Quadro ${BOARD.name}`);
  render();
});

function render() {
  $("#gate").hidden = !!user; $("#main").hidden = !user;
  if (!user) return;
  renderHead();
  board.hidden = view !== "board"; $("#workload").hidden = view !== "workload";
  if (view === "board") renderBoard(); else renderWorkload();
  renderDock();
  if (view === "board") fitBoard();   // o menu flutuante já está desenhado: a altura do quadro vai até ele
}

// ---------- Visões: o quadro e o Workload (?visao=workload) ----------
let view = new URLSearchParams(location.search).get("visao") === "workload" ? "workload" : "board";
$("#dock").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]"); if (!b || b.dataset.view === view) return;
  view = b.dataset.view;
  const u = new URL(location.href); if (view === "workload") u.searchParams.set("visao", "workload"); else u.searchParams.delete("visao"); history.replaceState(null, "", u);
  render();
});

// ---------- Workload ----------
// A roda: as áreas do quadro em volta, as skills entre elas e uma formiga pra cada pessoa em cada skill em que ela tem cartão aberto.
// Ao lado, a carga de cada um: uma barra por pessoa, uma cápsula por área, a cor é a skill e a textura é a coluna.
// Agora: tudo que está aberto. Sprint: o aberto mais o que virou feito dentro da sprint (2 semanas, contadas desde SPRINT_FROM).
const SPRINT_FROM = "2026-01-05";   // a segunda-feira em que a sprint 1 começou: não decidido
const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));
const STATE_ORDER = ["doing", "review", "backlog", "done"];
let wlPeriod = "now", wlOn = null, wheel = null;
// A skill de um cartão é a tag dele (um cartão pode ter várias). As áreas de cada tag vêm do quadro (board.json: tags).
// A roda é o mundo do quadro: todas as tags dele e as áreas delas, com ou sem cartão. As formigas aparecem onde tem cartão aberto.
const firstTag = (c) => (c.tags || [])[0];
function wlSkills() {
  return Object.keys(BOARD.tags || {}).map((name) => { const as = K.tagAreas(BOARD, name).filter((a) => AREA[a]); return { name, mix: Object.fromEntries(as.map((a) => [a, 1])), main: as[0], color: tagColor(name) }; }).filter((s) => s.main);
}
function wlAreas() {
  const used = new Set(wlSkills().flatMap((s) => Object.keys(s.mix)));
  return AREAS.filter((a) => used.has(a.id)).map((a) => ({ ...a, color: areaColor(a.color) }));
}
const stateOf = (c) => (K.isDone(c) ? "done" : ["doing", "review", "backlog"].includes(c.lane) ? c.lane : "backlog");
const stateName = (st) => (st === "done" ? "Feito" : laneName(st));
const iso = (d) => d.toISOString().slice(0, 10);
function sprint() {
  const day = 86400000, from = new Date(SPRINT_FROM + "T00:00:00Z"), now = new Date(iso(new Date()) + "T00:00:00Z");
  const len = WL.sprint_days(), d = Math.floor((now - from) / day);
  const start = new Date(+from + WL.sprint_start(d, len) * day), end = new Date(+start + (len - 1) * day);
  const fmt = (x) => x.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  return { n: WL.sprint_index(d, len) + 1, start: iso(start), end: iso(end), label: `${fmt(start)} a ${fmt(end)}` };
}
function tasksOf(login) {
  const mine = cards.filter((c) => c.who.includes(login) && !K.isShelf(BOARD, c.lane));   // guardado (Brainstorm, Refinamentos) não é carga
  if (wlPeriod === "now") return mine.filter((c) => !K.isDone(c));
  const sp = sprint();
  return mine.filter((c) => !K.isDone(c) || (c.done_at && c.done_at >= sp.start && c.done_at <= sp.end));
}
// Cor de quem está sem skill: neutro de verdade (é o único caso em que o cinza aparece).
const NONE = () => { const v = getComputedStyle(document.documentElement).getPropertyValue("--text-3").trim(); const m = v.match(/\d+/g); return m && !v.startsWith("#") ? "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("") : v || "#9a9aa2"; };
function groupsOf(tasks) {
  const skills = wlSkills(), info = Object.fromEntries(skills.map((s) => [s.name, s]));
  const pieces = (ts, color) => STATE_ORDER.map((st) => ({ n: ts.filter((c) => stateOf(c) === st).length, state: st, color })).filter((p) => p.n);
  const groups = wlAreas().map((a) => skills.filter((s) => s.main === a.id).flatMap((s) => pieces(tasks.filter((c) => firstTag(c) === s.name), s.color))).filter((g) => g.length);
  const loose = tasks.filter((c) => !info[firstTag(c)]);
  if (loose.length) groups.push(pieces(loose, NONE()));
  return groups;
}
function subOf(tasks) {
  const states = wlPeriod === "now" ? ["doing", "review", "backlog"] : STATE_ORDER;
  const info = Object.fromEntries(wlSkills().map((s) => [s.name, s]));
  const areas = new Set(tasks.flatMap((c) => (c.tags || []).map((t) => info[t]?.main)).filter(Boolean)).size, loose = tasks.filter((c) => !info[firstTag(c)]).length;
  return [...states.map((st) => `${tasks.filter((c) => stateOf(c) === st).length} ${stateName(st)}`), `${areas} ${areas === 1 ? "área" : "áreas"}`, ...(loose ? [`${loose} sem área`] : [])].join(" · ");
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function renderWorkload() {
  const side = $("#wl-side"), sp = sprint();
  const people = K.people(cards).map(([l]) => l);
  if (wlOn && !people.includes(wlOn)) wlOn = null;
  const bars = new Map(); let k = 0;
  const bar = (groups, total) => { const id = `w${++k}`; bars.set(id, { groups, total }); return `<span class="load-bar" data-bar="${id}"></span>`; };
  const key = (st, color) => { const id = `w${++k}`; bars.set(id, { key: st, color }); return `<span data-bar="${id}"></span>`; };
  const states = wlPeriod === "now" ? ["doing", "review", "backlog"] : STATE_ORDER;
  const head = `<div class="segmented" role="group" id="wl-period"><button type="button" data-v="now" aria-pressed="${wlPeriod === "now"}">Agora</button><button type="button" data-v="sprint" aria-pressed="${wlPeriod === "sprint"}">Sprint ${sp.n}</button></div>
    <span class="detail">${wlPeriod === "now" ? "Tudo que está aberto agora." : `Sprint ${sp.n} (${sp.label}): o que está aberto e o que foi feito nessas 2 semanas.`}</span>
    <div class="load-keys">${states.map((st) => `<span class="load-key">${key(st)}${esc(stateName(st))}</span>`).join("")}</div>`;
  if (wlOn) {
    const ts = tasksOf(wlOn).sort((a, b) => STATE_ORDER.indexOf(stateOf(a)) - STATE_ORDER.indexOf(stateOf(b)));
    const info = Object.fromEntries(wlSkills().map((s) => [s.name, s]));
    side.innerHTML = `${head}<div class="load-person">
      <div class="load-person__head"><button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon" data-wl-back aria-label="Voltar"><svg class="icon icon--sm"><use href="#i-arrow-left"/></svg></button>${avatar(photo(wlOn))}<span class="section-title">${esc(wlOn)}</span><span class="section-title load-person__count">${ts.length}</span></div>
      ${bar(groupsOf(ts), ts.length)}<span class="detail">${subOf(ts)}</span>
      <div class="load-tasks"><span class="group-title">${plural(ts.length, "tarefa", "tarefas")}</span>${ts.map((c) => `<button type="button" class="load-task" data-wl-card="${c.id}">${key(stateOf(c), info[firstTag(c)]?.color ?? NONE())}<span>${esc(c.title)} <span class="detail">· ${esc((c.tags || []).join(", ") || "sem tag")} · ${esc(stateName(stateOf(c)))}</span></span><span class="tag tag--mono">${c.id}</span></button>`).join("")}</div></div>`;
  } else {
    const rows = people.map((l) => [l, tasksOf(l)]).sort((a, b) => b[1].length - a[1].length);
    const max = Math.max(1, ...rows.map(([, ts]) => ts.length));
    side.innerHTML = `${head}<div class="load-list">${rows.map(([l, ts]) => `<button type="button" class="load-row" data-wl-person="${esc(l)}">${avatar(photo(l))}<span class="load-row__main">
      <span class="load-row__top"><span>${esc(l)}</span><span class="load-row__count">${plural(ts.length, "tarefa", "tarefas")}</span></span>${bar(groupsOf(ts), max)}<span class="detail">${subOf(ts)}</span></span></button>`).join("") || `<span class="detail">Ninguém tem cartão neste quadro ainda.</span>`}</div>`;
  }
  initSegmented($("#wl-period"));
  for (const el of side.querySelectorAll("[data-bar]")) { const b = bars.get(el.dataset.bar); if (b.key) loadKey(el, b.key, b.color); else loadBar(el, b.groups, { total: b.total }); }
  // A roda: só o aberto (onde cada um está agora).
  const skills = wlSkills();
  const data = { areas: wlAreas(), skills, people: people.map((l) => ({ id: l, name: l, src: photo(l).src, ai: !!photo(l).ai, skills: Object.fromEntries(skills.map((s) => [s.name, cards.filter((c) => c.who.includes(l) && (c.tags || []).includes(s.name) && !K.isDone(c) && !K.isShelf(BOARD, c.lane)).length])) })) };
  if (!wheel) wheel = mountWheel($("#wl-wheel"), data, { tip: (p, s, n) => `${plural(n, "tarefa", "tarefas")} de ${s}`, onPick: (id) => { wlOn = id; renderWorkload(); } });
  else wheel.update(data);
  wheel.focus(wlOn);
  fitWorkload();
}
// A vista cabe na tela: do cabeçalho até o menu flutuante.
function fitWorkload() {
  const el = $("#workload"); if (el.hidden) return;
  el.style.height = document.documentElement.hasAttribute("data-narrow") ? "" : `${Math.max(320, innerHeight - el.getBoundingClientRect().top - 88)}px`;
}
addEventListener("resize", fitWorkload);
$("#wl-side").addEventListener("click", (e) => {
  const per = e.target.closest("#wl-period [data-v]"); if (per) { wlPeriod = per.dataset.v; return renderWorkload(); }
  if (e.target.closest("[data-wl-back]")) { wlOn = null; return renderWorkload(); }
  const p = e.target.closest("[data-wl-person]"); if (p) { wlOn = p.dataset.wlPerson; return renderWorkload(); }
  const c = e.target.closest("[data-wl-card]"); if (c) openCard(c.dataset.wlCard);
});
// Na lista, o mouse em cima de uma pessoa mostra ela na roda só enquanto está em cima; saiu da linha, a roda volta.
$("#wl-side").addEventListener("pointerover", (e) => { const p = e.target.closest("[data-wl-person]"); if (!wheel) return; wheel.focus(p ? p.dataset.wlPerson : null, "hover"); });
$("#wl-side").addEventListener("pointerleave", () => wheel?.focus(null, "hover"));

function move(id, lane, before = null) {
  const c = cards.find((x) => x.id === id); if (!c || before === id) return render();
  if (c.lane === lane) { const xs = inLane(lane); if ((xs[xs.indexOf(c) + 1]?.id ?? null) === (before ?? null)) return render(); }   // soltou onde estava
  act("move", { id, lane, before }, c.lane === lane ? `${id} reordenado` : `${id} movido para ${laneName(lane)}`);
}
// Arrastar: da Bend-UI. O cartão levanta, os outros abrem espaço e ele assenta com a mola do MOTION.bend.
// Concluir: também da Bend-UI. O círculo fica verde e o cartão vai pro topo do Feito sem atravessar o quadro: fecha no
// próprio meio, o espaço dele fecha enquanto o do Feito abre, e ele abre lá (moveCard). Desmarcar devolve pro lugar
// de onde saiu, do mesmo jeito. Pra onde ele vai quem decide é o modelo (lib/board.mjs: update).
function complete(id, done) {
  const el = board.querySelector(`.card[data-id="${id}"]`), was = cards.find((x) => x.id === id)?.lane;
  act("update", { id, done }, done ? `${id} concluído` : `${id} reaberto`, true);
  const c = cards.find((x) => x.id === id);
  if (!el || !c || c.lane === was) return;   // ficou onde estava
  const list = board.querySelector(`.lane[data-lane="${c.lane}"] .lane__cards`), xs = inLane(c.lane), next = xs[xs.indexOf(c) + 1];
  const counts = () => { for (const l of board.querySelectorAll(".lane")) $(".lane__head .tag", l).textContent = inLane(l.dataset.lane).length; };
  moveCard(el, list, { before: next ? list.querySelector(`.card[data-id="${next.id}"]`) : null, wait: done ? checkTime() : 0, onSwap: counts })
    .then(() => { if (!typing()) render(); });   // o menu do cartão (Mover para…) depende da coluna em que ele está
}
initBoard(board, {
  onDrop: (id, lane, before) => move(id, lane, before),
  labels: CHECK,
  onDone: complete,
});

board.addEventListener("pick", (e) => {
  const id = e.target.closest(".card").dataset.id, item = e.detail;
  if (item.dataset.move) move(id, item.dataset.move);
  if ("open" in item.dataset) openCard(id);
  if ("remove" in item.dataset) act("remove", { id }, `${id} removido`);
});
// Clicar no cartão (ou Enter nele) abre o cartão.
board.addEventListener("click", (e) => {
  if (e.target.closest("[data-shelf]")) {
    shelfOpen = !shelfOpen;
    try { localStorage.setItem(SHELF_KEY, shelfOpen ? "1" : "0"); } catch {}
    renderBoard(); return $("[data-shelf]", board)?.focus();
  }
  const add = e.target.closest("[data-add]");
  if (add) return addCard(add.parentElement);
  const c = e.target.closest(".card");
  if (c && !e.target.closest(".dropdown, .card__mark")) openCard(c.dataset.id);
});
board.addEventListener("keydown", (e) => {
  const c = e.target.closest?.(".card");
  if (c && e.target === c && e.key === "Enter") openCard(c.dataset.id);
});

// Cartão novo: o campo é o próprio cartão da lib (.card__field). No Enter ele aparece na hora e cresce
// do tamanho do campo até o do cartão (formCard, com o rise do MOTION.bend).
function addCard(box) {
  box.innerHTML = newCard("Título do cartão", "Novo cartão");
  const input = $(".card__field", box), lane = box.closest(".lane").dataset.lane;
  fitField(input); input.focus();
  let closed = false;
  const finish = (save) => {
    if (closed) return; closed = true;
    const t = input.value.trim(), from = box.firstElementChild.offsetHeight;
    if (!(save && t)) return render();
    const had = new Set(inLane(lane).map((c) => c.id));
    act("add", { board: cur, title: t, lane }, "Cartão criado");
    const fresh = inLane(lane).find((c) => !had.has(c.id));
    if (fresh) formCard(board.querySelector(`.card[data-id="${fresh.id}"]`), from);
  };
  input.addEventListener("keydown", (k) => { if (k.key === "Enter") { k.preventDefault(); finish(true); } if (k.key === "Escape") finish(false); });
  input.addEventListener("blur", () => finish(true));
}

// ---------- Cartão aberto (a ficha da lib: cardDialog) ----------
// Já abre grande; o título e as notas se editam ali mesmo e a caixa cresce com o texto. Ao lado do número fica a coluna;
// embaixo do título, só as tags e as fotos de quem está no cartão, e um + no fim da linha. O + põe o resto no cartão
// (os cartões que ele espera, os que esperam por ele, os ligados a ele, uma checklist), e cada coisa posta vira um
// bloco embaixo das notas (as .card-piece da lib). As subtasks já têm o bloco delas, com uma linha pra escrever.
// Nada depende do botão Salvar: título, notas, coluna, tags, pessoas e checklists são salvos sozinhos um instante depois
// de parar de mexer, ao sair do campo, ao fechar (X, Esc, clique fora, Salvar) e ao sair da página; cada salvamento é
// um commit, por isso a pausa. Subtasks e relações mexem em mais de um cartão: cada uma é salva na hora.
const SAVE_PAUSE = 1500;   // ms parado antes de salvar sozinho: não decidido
const SUB_LEVELS = 7;      // quantos níveis de subtask abrem dentro da ficha: não decidido. Depois do último, a subtask abre como cartão.
const MULTI = ["tags", "who"];
const RELS = { blocked_by: ["Esperando por", "lock"], blocking: ["Bloqueando", "circle-alert"], related: ["Vinculado a", "link"] };
// editing: o cartão aberto. pick: coluna, tags e pessoas escolhidas; lists: as checklists como estão na tela;
// shown: relações que entraram pelo + e ainda não têm cartão; addAt: de qual cartão é a lista em que a linha de adicionar subtask está.
let editing = null;
const ICON = (name) => `<svg class="icon icon--sm" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const tagChip = tagPill;
// Em cima fica o mínimo: a coluna é só o nome, as tags são as pílulas e as pessoas são as fotos. Sem tag ou sem pessoa, só o ícone.
const SHOW = {
  lane: (v) => `<span>${esc(laneName(v))}</span>`,
  tags: (v) => (v.length ? `<span class="tag-pills">${v.map(tagChip).join("")}</span>` : ICON("tag")),
  who: (v) => (v.length ? avatars(v.map(photo)) : ICON("user")),
};
const bare = (kind) => MULTI.includes(kind) && !editing.pick[kind].length;
const picked = (kind, v) => (MULTI.includes(kind) ? editing.pick[kind].includes(v) : editing.pick[kind] === v);
const CHECKED = `<svg class="icon icon--sm menu__check" aria-hidden="true"><use href="#i-check"/></svg>`;
const choiceItem = (kind, v, label) => `<button type="button" class="menu__item" role="${MULTI.includes(kind) ? "menuitemcheckbox" : "menuitemradio"}" aria-checked="${picked(kind, v)}" data-v="${esc(v)}">${label}${CHECKED}</button>`;
const choiceMenu = (kind, label, items) => `<div class="dropdown" data-kind="${kind}"><button type="button" class="btn btn--ghost btn--sm${bare(kind) ? " btn--icon" : ""}" aria-haspopup="menu" aria-expanded="false" aria-label="${label}" title="${label}" data-show>${SHOW[kind](editing.pick[kind])}</button><div class="menu" role="menu" hidden>${items}</div></div>`;
const byId = (id) => cards.find((x) => x.id === id);
const relCards = (c, k) => (k === "blocked_by" ? K.waitsFor(cards, c) : k === "blocking" ? K.blocking(cards, c) : K.relatedOf(cards, c));
const relOn = (c, k) => !!editing.shown[k] || relCards(c, k).length > 0;

// A linha de cima: tags, fotos e o +. O + lista só o que ainda não está no cartão.
function dataHtml(c) {
  const people = [...new Set([user, ...c.who, ...BOARDS.flatMap((b) => K.people(b.cards).map(([l]) => l))].filter(Boolean))];
  const more = Object.keys(RELS).filter((k) => !relOn(c, k)).map((k) => `<button type="button" class="menu__item" role="menuitem" data-add-rel="${k}">${ICON(RELS[k][1])}<span>${RELS[k][0]}</span></button>`).join("")
    + `<button type="button" class="menu__item" role="menuitem" data-add-list>${ICON("list")}<span>Checklist</span></button>`;
  return choiceMenu("tags", "Tags", Object.keys(BOARD.tags).map((t) => choiceItem("tags", t, `<span class="tag-pills">${tagChip(t)}</span>`)).join(""))
    + choiceMenu("who", "Pessoas", people.map((p) => choiceItem("who", p, `${avatars([photo(p)])}<span>@${esc(p)}</span>`)).join(""))
    + `<div class="dropdown card-dialog__add"><button type="button" class="btn btn--ghost btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Adicionar ao cartão" title="Adicionar ao cartão">${ICON("plus")}</button><div class="menu menu--end" role="menu" hidden>${more}</div></div>`;
}
const drawData = () => { const c = editing && byId(editing.id), box = $("[data-data]", dialogEl); if (c && box) box.innerHTML = dataHtml(c); };

// Uma linha que é um cartão: o que vem antes (o círculo ou um ícone), o número e o título (abre o cartão), e o que vem depois.
const cardRow = (x, lead, end) => `<div class="card-item__row">${lead}<button type="button" class="card-item__link" data-open-card="${x.id}"><span class="tag tag--mono">${x.id}</span><span class="card-item__title">${esc(x.title)}</span></button>${end}</div>`;
const rowEnd = (x, n) => `${n ? `<span class="tag">${ICON("list")}${n[0]}/${n[1]}</span>` : ""}${x.who.length ? avatars(x.who.map(photo)) : ""}<span class="tag">${esc(laneName(x.lane))}</span>`;
const rowMenu = (acts) => `<div class="dropdown card-item__more"><button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Ações da linha"><svg class="icon"><use href="#i-ellipsis"/></svg></button>
  <div class="menu menu--end" role="menu" hidden>${acts.map(([a, i, t]) => `<button type="button" class="menu__item" role="menuitem" data-act="${a}">${ICON(i)}<span>${t}</span></button>`).join("")}</div></div>`;
const PIECE_MENU = `<div class="dropdown"><button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Ações da lista"><svg class="icon"><use href="#i-ellipsis"/></svg></button>
  <div class="menu menu--end" role="menu" hidden><button type="button" class="menu__item" role="menuitem" data-act="drop-piece">${ICON("trash-2")}<span>Remover a lista</span></button></div></div>`;
const KEYS = `<span><span class="kbd">Enter</span> cria e segue</span><span><span class="kbd">Tab</span> pra dentro</span><span><span class="kbd">Shift</span> <span class="kbd">Tab</span> pra fora</span>`;
// A linha de adicionar subtask: embaixo dela, as teclas que valem ali; quando uma tecla não pode fazer o que pediu, a razão aparece no lugar.
const addRow = (owner) => `<div class="card-add" data-owner="${owner}"><div class="card-item__row"><span class="card-add__mark">${ICON("plus")}</span><input class="card-dialog__field card-add__field" data-sub-new placeholder="Adicionar subtask" aria-label="Adicionar subtask" autocomplete="off"></div><p class="detail card-add__keys">${editing.hint ? esc(editing.hint) : KEYS}</p></div>`;

// Uma relação: o nome dela, os cartões em linhas e um + pra escolher outro. Em "Esperando por", o cadeado vira um check quando o cartão termina.
// "Bloqueando" chama atenção: o bloco inteiro fica no vermelho da lib enquanto este cartão não termina (tem cartão parado por causa dele).
function relBlock(c, k) {
  const [name, ic] = RELS[k], xs = relCards(c, k), on = new Set(xs.map((x) => x.id));
  const holds = k === "blocking" && !K.isDone(c);
  const rows = xs.map((x) => {
    const free = k === "blocked_by" && K.isDone(x), tone = k !== "blocked_by" ? "" : free ? " card-item__mark--success" : " card-item__mark--warning";
    return `<li class="card-item${free ? " is-done" : ""}">${cardRow(x, `<span class="card-item__mark${tone}">${ICON(free ? "circle-check" : ic)}</span>`, `${rowEnd(x)}<button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon card-item__more" data-rel-off="${k}" data-id="${x.id}" aria-label="Tirar ${x.id}">${ICON("x")}</button>`)}</li>`;
  }).join("");
  const others = cards.filter((x) => x.id !== c.id).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const pick = `<div class="dropdown" data-rel="${k}"><button type="button" class="btn btn--plain btn--neutral btn--sm" aria-haspopup="menu" aria-expanded="false" aria-label="Escolher cartão">${ICON("plus")}Cartão</button><div class="menu" role="menu" hidden><div class="menu__list">${others.map((x) => `<button type="button" class="menu__item" role="menuitemcheckbox" aria-checked="${on.has(x.id)}" data-v="${x.id}"><span class="tag tag--mono">${x.id}</span><span>${esc(x.title)}</span>${CHECKED}</button>`).join("")}</div></div></div>`;
  return `<section class="card-piece${holds ? " card-piece--danger" : ""}" data-piece="rel:${k}"><header class="card-piece__head"><h3 class="group-title">${name}</h3>${xs.length ? `<span class="tag">${xs.length}</span>` : ""}${PIECE_MENU}</header>${rows ? `<ul class="card-list">${rows}</ul>` : ""}${pick}</section>`;
}
// As subtasks: cada uma é um cartão (o círculo conclui ele, o título abre). Uma subtask pode ter as dela, até SUB_LEVELS níveis.
function subRows(parent, depth) {
  const inside = depth < SUB_LEVELS - 1;
  return K.subsOf(cards, parent).map((x, i) => {
    const done = K.isDone(x), adding = editing.addAt === x.id, kids = K.subsOf(cards, x);
    const acts = [inside && ["sub-in", "plus", "Adicionar subtask dentro"], inside && i > 0 && ["sub-indent", "arrow-right", "Pra dentro"], depth > 0 && ["sub-outdent", "arrow-left", "Pra fora"], ["sub-remove", "trash-2", "Remover"]].filter(Boolean);
    const below = inside && (kids.length || adding) ? `<ul class="card-list">${subRows(x, depth + 1)}${adding ? `<li>${addRow(x.id)}</li>` : ""}</ul>` : "";
    return `<li class="card-item${done ? " is-done" : ""}" data-sub="${x.id}" data-parent="${parent.id}">${cardRow(x, itemCheck(done, { labels: CHECK, just: editing.just === x.id }), rowEnd(x, inside ? null : K.progress(cards, x)) + rowMenu(acts))}${below}</li>`;
  }).join("");
}
function subsBlock(c) {
  const xs = K.subsOf(cards, c);
  const head = xs.length ? `<header class="card-piece__head"><h3 class="group-title">Subtasks</h3><span class="tag">${xs.filter(K.isDone).length}/${xs.length}</span></header><ul class="card-list">${subRows(c, 0)}</ul>` : "";
  const tail = editing.addAt === c.id ? addRow(c.id) : `<button type="button" class="btn btn--plain btn--neutral btn--sm" data-add-top>${ICON("plus")}Adicionar subtask</button>`;
  return `<section class="card-piece" data-piece="subs">${head}${tail}</section>`;
}
// Uma checklist: o nome (editável), quanto está feito, os itens (texto editável) e a linha de adicionar.
function listBlock(l, i) {
  const n = l.items.filter((it) => it.done).length;
  const rows = l.items.map((it, j) => `<li class="card-item${it.done ? " is-done" : ""}" data-list="${i}" data-item="${j}"><div class="card-item__row">${itemCheck(it.done, { labels: CHECK, just: editing.just === `${i}:${j}` })}<input class="card-dialog__field card-item__text" value="${esc(it.text)}" data-item-text aria-label="Item"><button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon card-item__more" data-item-off aria-label="Remover item">${ICON("x")}</button></div></li>`).join("");
  return `<section class="card-piece" data-piece="list:${i}"><header class="card-piece__head"><input class="card-dialog__field card-piece__name" value="${esc(l.name)}" data-list-name="${i}" aria-label="Nome da checklist"><span class="tag">${l.items.length ? Math.round((n / l.items.length) * 100) : 0}%</span>${PIECE_MENU}</header>${rows ? `<ul class="card-list">${rows}</ul>` : ""}
    <div class="card-add"><div class="card-item__row"><span class="card-add__mark">${ICON("plus")}</span><input class="card-dialog__field card-add__field" data-list-new="${i}" placeholder="Adicionar item" aria-label="Adicionar item" autocomplete="off"></div></div></section>`;
}
// Desenha os blocos de novo. Quem estava escrevendo numa linha de adicionar continua nela, com o que já tinha escrito.
function drawPieces(focus) {
  const c = editing && byId(editing.id), box = $("[data-pieces]", dialogEl); if (!c || !box) return;
  const a = document.activeElement;
  const keep = !focus && box.contains(a) && a.matches("[data-sub-new], [data-list-new]") ? { sel: a.matches("[data-sub-new]") ? "[data-sub-new]" : `[data-list-new="${a.dataset.listNew}"]`, value: a.value } : null;
  if (!byId(editing.addAt)) editing.addAt = editing.id;
  box.innerHTML = Object.keys(RELS).filter((k) => relOn(c, k)).map((k) => relBlock(c, k)).join("") + subsBlock(c) + editing.lists.map(listBlock).join("");
  editing.just = null; editing.hint = "";
  const el = focus ? $(focus, box) : keep ? $(keep.sel, box) : null;
  if (el) { el.focus(); if (keep) el.value = keep.value; if (el.matches("[data-list-name]")) el.select(); }
  // A caixa acompanha o tamanho novo com o mesmo movimento de quando as notas crescem (a ficha da lib ouve o campo).
  $(".card-dialog__notes", dialogEl)?.dispatchEvent(new Event("input", { bubbles: true }));
}
function openCard(id) {
  const c = byId(id); if (!c) return;
  editing = { id, pick: { lane: c.lane, tags: [...(c.tags || [])], who: [...c.who] }, timer: 0, lists: structuredClone(c.lists || []), shown: {}, addAt: id, hint: "", just: null };
  const up = K.parentOf(cards, id);   // uma subtask mostra de que cartão ela é, e volta pra ele
  dialogEl.setAttribute("aria-label", `${c.id}: ${c.title}`);
  dialogEl.innerHTML = `
    <header class="dialog__header"><span class="card-dialog__lead">${up ? `<button type="button" class="btn btn--ghost btn--sm mono" data-open-card="${up.id}" aria-label="Abrir ${up.id}: ${esc(up.title)}" title="${esc(up.title)}">${up.id}</button>${ICON("chevron-right")}` : ""}<span class="tag tag--mono">${c.id}</span>
      ${choiceMenu("lane", "Coluna", BOARD.lanes.map((l) => choiceItem("lane", l.id, `<span>${esc(l.name)}</span>`)).join(""))}</span><div class="toolbar__spacer"></div>
      <div class="dropdown"><button type="button" class="btn btn--ghost btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Ações de ${c.id}"><svg class="icon"><use href="#i-ellipsis"/></svg></button>
        <div class="menu menu--end" role="menu" hidden><button type="button" class="menu__item" role="menuitem" data-remove>${ICON("trash-2")}<span>Remover</span></button></div></div>
      <button type="button" class="btn btn--ghost btn--sm btn--icon" data-close aria-label="Fechar"><svg class="icon"><use href="#i-x"/></svg></button></header>
    <div class="card-dialog__body">
      <textarea class="card-dialog__field card-dialog__title" rows="1" aria-label="Título">${esc(c.title)}</textarea>
      <div class="card-dialog__data" data-data>${dataHtml(c)}</div>
      <textarea class="card-dialog__field card-dialog__notes" rows="1" aria-label="Notas" placeholder="Adicionar notas…">${esc(c.notes || "")}</textarea>
      <div class="card-dialog__pieces" data-pieces></div>
    </div>
    <div class="actions"><button type="button" class="btn btn--filled" data-save>Salvar</button></div>`;
  drawPieces();
  dialog.open();
  // Ao abrir, o navegador põe o foco no primeiro botão (a coluna, no topo): tira, pra ficha não abrir com um botão marcado.
  if (document.activeElement?.closest?.(".dialog__header")) document.activeElement.blur();
}
// O que está na ficha agora e o que disso é diferente do cartão. Título vazio não vale: fica o que estava.
const sameField = (a, b) => (Array.isArray(a) ? a.join(",") === (b || []).join(",") : a === (b ?? ""));
function unsaved() {
  const c = editing && byId(editing.id); if (!c) return null;
  const now = { title: $(".card-dialog__title", dialogEl).value.trim(), notes: $(".card-dialog__notes", dialogEl).value.trimEnd(), lane: editing.pick.lane, tags: editing.pick.tags, who: editing.pick.who };
  const d = Object.fromEntries(Object.entries(now).filter(([k, v]) => !sameField(v, c[k]) && !(k === "title" && !v)));
  // As checklists vão inteiras, e só as que têm item (uma recém-criada, ainda vazia, existe só na tela).
  const lists = K.cleanLists(editing.lists);
  if (JSON.stringify(lists) !== JSON.stringify(K.cleanLists(c.lists))) d.lists = lists;
  return Object.keys(d).length ? d : null;
}
// unsent: o que já saiu daqui e ainda não tem a resposta do servidor (id → campos). Serve pra sair da página sem perder.
const unsent = new Map();
function saveCard() {
  if (!editing) return;
  clearTimeout(editing.timer); editing.timer = 0;
  const id = editing.id, d = unsaved(); if (!d) return;
  const p = act("update", { id, ...structuredClone(d) }, `${id} salvo`);
  if (!p) return;
  const mine = { ...unsent.get(id), ...d }; unsent.set(id, mine);
  p.then(() => { if (unsent.get(id) === mine) unsent.delete(id); });
}
const saveSoon = () => { clearTimeout(editing.timer); editing.timer = setTimeout(saveCard, SAVE_PAUSE); };
dialogEl.addEventListener("input", (e) => {
  const t = e.target; if (!editing || !t.matches?.(".card-dialog__field")) return;
  if (t.matches("[data-sub-new], [data-list-new]")) return;   // ainda não é nada: vira subtask ou item no Enter
  if (t.matches("[data-item-text]")) { const li = t.closest("[data-item]"); editing.lists[+li.dataset.list].items[+li.dataset.item].text = t.value; }
  if (t.matches("[data-list-name]")) editing.lists[+t.dataset.listName].name = t.value;
  saveSoon();
});
dialogEl.addEventListener("focusout", (e) => { if (editing && e.target.matches?.(".card-dialog__field") && !e.target.matches("[data-sub-new], [data-list-new]")) saveCard(); });
// Um item escrito na linha de adicionar e ainda sem Enter também conta: vira item antes de salvar.
function takeNew() {
  if (!editing) return false;
  let took = false;
  for (const el of dialogEl.querySelectorAll("[data-list-new]")) {
    const text = el.value.trim(), l = editing.lists[+el.dataset.listNew];
    if (text && l) { l.items.push({ text, done: false }); el.value = ""; took = true; }
  }
  return took;
}
// Saiu da linha de adicionar pra fora da área dos blocos: o que estava escrito vira item (dentro dos blocos fica na linha, pra não sumir o que foi clicado).
dialogEl.addEventListener("focusout", (e) => {
  if (!editing || !e.target.matches?.("[data-list-new]")) return;
  if (e.relatedTarget && $("[data-pieces]", dialogEl)?.contains(e.relatedTarget)) return;
  if (takeNew()) { drawPieces(); saveSoon(); }
});
// Fechou, de qualquer jeito (X, Esc, clique fora, Salvar): salva o que faltava.
dialogEl.addEventListener("close", () => { takeNew(); saveCard(); editing = null; });
document.addEventListener("visibilitychange", () => { if (document.hidden) { takeNew(); saveCard(); } });
// Clique fora fecha a ficha (a lib), mas só se ele começou fora: arrastar de dentro pra fora (selecionando texto) não fecha.
// O navegador entrega esse clique no próprio <dialog>; a captura no document vem antes da lib e o barra.
let downInside = false;
dialogEl.addEventListener("pointerdown", (e) => {
  const r = dialogEl.getBoundingClientRect();
  downInside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
});
document.addEventListener("click", (e) => { if (e.target === dialogEl && downInside) e.stopImmediatePropagation(); downInside = false; }, true);
// Saindo da página (fechar a aba, recarregar): o que ainda não chegou vai num pedido que o navegador termina sozinho.
// Mandar de novo um campo que já foi salvo não muda nada no servidor.
addEventListener("pagehide", () => {
  if (!live) return;
  takeNew();
  const d = unsaved(); if (d) unsent.set(editing.id, { ...unsent.get(editing.id), ...d });
  for (const [id, fields] of unsent) fetch("/api/update", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...fields }) }).catch(() => {});
});
// Esc com um menu aberto fecha só o menu (a lib fecha); a ficha continua aberta.
dialogEl.addEventListener("keydown", (e) => { if (e.key === "Escape" && dialogEl.querySelector(".dropdown > .menu:not([hidden])")) e.preventDefault(); });
function pickChoice(dd, v) {
  const k = dd.dataset.kind;
  if (MULTI.includes(k)) { const xs = editing.pick[k]; editing.pick[k] = xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]; for (const it of dd.querySelectorAll(".menu__item")) it.setAttribute("aria-checked", String(editing.pick[k].includes(it.dataset.v))); }
  else editing.pick[k] = v;
  const btn = $("[data-show]", dd);
  btn.innerHTML = SHOW[k](editing.pick[k]); btn.classList.toggle("btn--icon", bare(k));
  dispatchEvent(new Event("resize"));   // o botão mudou de tamanho: a ficha e o menu aberto se ajeitam
  saveSoon();
}

// ---------- Subtasks: escrever uma embaixo da outra ----------
// Enter cria a subtask e a linha continua ali pra próxima. Tab leva a linha pra dentro da última subtask da lista em que
// ela está; Shift+Tab traz de volta um nível. Numa linha vazia de dentro, Enter ou apagar também sobem. Colar várias
// linhas cria uma subtask pra cada.
const listDepth = (owner) => { let d = 0, id = owner; while (id !== editing.id && d < 12) { const p = K.parentOf(cards, id); if (!p) break; id = p.id; d++; } return d; };
function addSubs(owner, titles) {
  act("sub", { id: owner, titles }, titles.length === 1 ? "Subtask criada" : `${titles.length} subtasks criadas`);
  drawPieces("[data-sub-new]");
}
function moveAdd(dir, text) {
  const owner = byId(editing.addAt), kids = owner ? K.subsOf(cards, owner) : [], last = kids[kids.length - 1];
  if (dir > 0) {
    if (!last) editing.hint = "Pra entrar um nível, crie antes a subtask que vai ficar em cima.";
    else if (listDepth(owner.id) + 1 >= SUB_LEVELS) editing.hint = `Último nível (${SUB_LEVELS} de ${SUB_LEVELS}). Daqui pra dentro, só abrindo a subtask como cartão.`;
    else editing.addAt = last.id;
  } else if (editing.addAt !== editing.id) editing.addAt = K.parentOf(cards, editing.addAt)?.id ?? editing.id;
  drawPieces("[data-sub-new]");
  const el = $("[data-sub-new]", dialogEl); if (el && text) el.value = text;
}
// O menu de uma subtask: abrir a linha de adicionar dentro dela, levar ela um nível pra dentro (da de cima) ou pra fora, ou remover.
function subAct(what, li) {
  const id = li.dataset.sub, parent = byId(li.dataset.parent), list = parent.subs, i = list.indexOf(id);
  if (what === "sub-in") { editing.addAt = id; return drawPieces("[data-sub-new]"); }
  if (what === "sub-indent") { const into = byId(list[i - 1]); act("subs", { set: { [parent.id]: list.filter((z) => z !== id), [into.id]: [...(into.subs || []), id] } }, `${id} dentro de ${into.id}`); }
  if (what === "sub-outdent") {
    const up = K.parentOf(cards, parent.id); if (!up) return;
    const at = up.subs.indexOf(parent.id);
    act("subs", { set: { [parent.id]: list.filter((z) => z !== id), [up.id]: [...up.subs.slice(0, at + 1), id, ...up.subs.slice(at + 1)] } }, `${id} um nível pra fora`);
  }
  if (what === "sub-remove") { if (editing.addAt === id) editing.addAt = editing.id; act("remove", { id }, `${id} removido`); }
  drawPieces();
}
// Liga ou desliga uma relação do cartão aberto com outro cartão.
function setRel(k, other, on) {
  act("rel", { id: editing.id, kind: k, other, on }, on ? "Relação salva" : "Relação removida");
  editing.shown[k] = true;
  drawData(); drawPieces();
}
// O menu de escolher cartão de uma relação continua aberto depois de marcar um, pra marcar vários.
const reopen = (k) => setTimeout(() => $(`.dropdown[data-rel="${k}"] > button`, dialogEl)?.click(), 0);
const pastedLines = (e) => (e.clipboardData?.getData("text") || "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*(?:\[.?\]\s*)?/, "").trim()).filter(Boolean);
dialogEl.addEventListener("paste", (e) => {
  const t = e.target; if (!editing || !t.matches?.("[data-sub-new], [data-list-new]")) return;
  const lines = pastedLines(e); if (lines.length < 2) return;
  e.preventDefault();
  if (t.matches("[data-sub-new]")) return addSubs(t.closest(".card-add").dataset.owner, lines);
  const i = +t.dataset.listNew;
  editing.lists[i].items.push(...lines.map((text) => ({ text, done: false })));
  drawPieces(`[data-list-new="${i}"]`); saveSoon();
});
dialogEl.addEventListener("keydown", (e) => {
  const t = e.target; if (!editing || !t.matches?.("input")) return;
  if (t.matches("[data-sub-new]")) {
    const owner = t.closest(".card-add").dataset.owner, inner = owner !== editing.id;
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); return moveAdd(1, t.value); }
    if (e.key === "Tab" && inner) { e.preventDefault(); return moveAdd(-1, t.value); }
    if ((e.key === "Enter" || e.key === "Backspace") && !t.value && inner) { e.preventDefault(); return moveAdd(-1, ""); }
    if (e.key === "Enter") { e.preventDefault(); const title = t.value.trim(); if (title) addSubs(owner, [title]); }
    return;
  }
  if (t.matches("[data-list-new]") && e.key === "Enter") {
    e.preventDefault();
    const i = +t.dataset.listNew, text = t.value.trim(); if (!text) return;
    editing.lists[i].items.push({ text, done: false });
    drawPieces(`[data-list-new="${i}"]`); return saveSoon();
  }
  if (t.matches("[data-item-text]")) {
    const li = t.closest("[data-item]"), i = +li.dataset.list;
    if (e.key === "Enter") { e.preventDefault(); $(`[data-list-new="${i}"]`, dialogEl)?.focus(); }
    if (e.key === "Backspace" && !t.value) { e.preventDefault(); editing.lists[i].items.splice(+li.dataset.item, 1); drawPieces(`[data-list-new="${i}"]`); saveSoon(); }
    return;
  }
  if (t.matches("[data-list-name]") && e.key === "Enter") { e.preventDefault(); $(`[data-list-new="${t.dataset.listName}"]`, dialogEl)?.focus(); }
});
dialogEl.addEventListener("pick", (e) => {
  if (!editing) return;
  const item = e.detail, c = byId(editing.id);
  if ("remove" in item.dataset) { const id = editing.id; clearTimeout(editing.timer); editing = null; dialog.close(); return act("remove", { id }, `${id} removido`); }
  // O +: uma relação entra como bloco e já abre o menu de escolher cartão; uma checklist entra com o nome pronto pra trocar.
  if (item.dataset.addRel) { const k = item.dataset.addRel; editing.shown[k] = true; drawData(); drawPieces(); return reopen(k); }
  if ("addList" in item.dataset) { editing.lists.push({ name: "Checklist", items: [] }); return drawPieces(`[data-list-name="${editing.lists.length - 1}"]`); }
  const what = item.dataset.act;
  if (what === "drop-piece") {
    const piece = item.closest("[data-piece]").dataset.piece;
    if (piece.startsWith("list:")) { editing.lists.splice(+piece.slice(5), 1); drawPieces(); return saveSoon(); }
    const k = piece.slice(4);
    for (const x of relCards(c, k)) act("rel", { id: c.id, kind: k, other: x.id, on: false }, "Relação removida");
    editing.shown[k] = false;
    drawData(); return drawPieces();
  }
  if (what?.startsWith("sub-")) return subAct(what, item.closest("[data-sub]"));
  const dd = e.target.closest(".dropdown[data-kind]"); if (dd) pickChoice(dd, item.dataset.v);
});
dialogEl.addEventListener("click", (e) => {
  if (!editing) return;
  const t = e.target;
  // Tags e pessoas: marcar uma não fecha o menu (o clique não chega no fecha-menu da lib), então dá pra marcar várias de uma vez.
  const multi = t.closest('.dropdown[data-kind] > .menu > .menu__item[role="menuitemcheckbox"]');
  if (multi) { e.stopPropagation(); return pickChoice(multi.closest(".dropdown"), multi.dataset.v); }
  const rel = t.closest(".dropdown[data-rel] .menu__item");
  if (rel) { e.stopPropagation(); const k = rel.closest(".dropdown").dataset.rel; setRel(k, rel.dataset.v, rel.getAttribute("aria-checked") !== "true"); return reopen(k); }
  const off = t.closest("[data-rel-off]");
  if (off) return setRel(off.dataset.relOff, off.dataset.id, false);
  const open = t.closest("[data-open-card]");
  if (open) { saveCard(); return openCard(open.dataset.openCard); }
  const check = t.closest(".card-item .card__check");
  if (check) {
    const li = check.closest(".card-item");
    if (li.dataset.sub) {
      // Concluir uma subtask é concluir o cartão dela (vai pro Feito, como no quadro). Uma que está no Feito sem o círculo volta pra primeira coluna.
      const x = byId(li.dataset.sub), done = !K.isDone(x);
      editing.just = done ? x.id : null;
      act("update", !done && !x.done ? { id: x.id, lane: K.firstLane(BOARD) } : { id: x.id, done }, done ? `${x.id} concluído` : `${x.id} reaberto`);
      return drawPieces();
    }
    const it = editing.lists[+li.dataset.list].items[+li.dataset.item];
    it.done = !it.done; editing.just = it.done ? `${li.dataset.list}:${li.dataset.item}` : null;
    drawPieces(); return saveSoon();
  }
  if (t.closest("[data-item-off]")) { const li = t.closest("[data-item]"); editing.lists[+li.dataset.list].items.splice(+li.dataset.item, 1); drawPieces(); return saveSoon(); }
  if (t.closest("[data-add-top]")) { editing.addAt = editing.id; return drawPieces("[data-sub-new]"); }
  if (t.closest("[data-save]")) { saveCard(); return void dialog.close(); }
  if (t.closest("[data-close]")) dialog.close();
});

// ---------- Tags do quadro (a engrenagem no cabeçalho) ----------
// Cada tag e as áreas dela. Salvar grava o board.json do quadro; uma tag que sai também sai dos cartões.
const tagsDialog = createDialog($("#tags-dialog"), { title: $("#tags-title"), body: $("#tags-body"), close: $("#tags-close") });
let tagEdit = null;   // { tags: { tag: [áreas] }, open: tag | null }
const areaLabel = (id) => `<span class="tag-area"><i class="tag-area__dot" style="--area:${areaColor(AREA[id].color)}"></i>${esc(AREA[id].name)}</span>`;
const editColor = (t) => { const as = (tagEdit.tags[t] || []).filter((a) => AREA[a]); return as.length ? skillColor(as.map((a) => [areaColor(AREA[a].color), 1])) : NONE(); };
function drawTags() {
  const body = $("#tags-body");
  body.innerHTML = `<div class="tag-list">${Object.entries(tagEdit.tags).map(([t, as]) => `<div class="tag-row" data-tag="${esc(t)}">
      <div class="tag-row__main"><span class="tag-pill" style="--skill:${editColor(t)}">${esc(t)}</span><span class="tag-row__areas">${as.filter((a) => AREA[a]).map(areaLabel).join("") || `<span class="detail">sem área</span>`}</span>
        <button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon" data-tag-edit aria-label="Áreas de ${esc(t)}" aria-pressed="${tagEdit.open === t}"><svg class="icon icon--sm"><use href="#i-pencil"/></svg></button>
        <button type="button" class="btn btn--plain btn--neutral btn--sm btn--icon" data-tag-remove aria-label="Tirar ${esc(t)}"><svg class="icon icon--sm"><use href="#i-x"/></svg></button></div>
      ${tagEdit.open === t ? `<div class="tag-row__pick">${AREAS.map((a) => `<button type="button" class="btn btn--sm btn--bordered btn--neutral area-toggle" style="--area:${areaColor(a.color)}" data-tag-area="${a.id}" aria-pressed="${as.includes(a.id)}"><i class="tag-area__dot"></i>${esc(a.name)}</button>`).join("")}</div>` : ""}
    </div>`).join("") || `<span class="detail">Nenhuma tag ainda.</span>`}</div>
    <form class="tag-add" id="tag-add"><input class="input input--sm" id="tag-new" placeholder="Nova tag" aria-label="Nova tag" autocomplete="off"><button type="submit" class="btn btn--sm btn--bordered"><svg class="icon icon--sm"><use href="#i-plus"/></svg>Adicionar</button></form>
    <div class="actions"><button type="button" class="btn btn--ghost" data-tags-cancel>Cancelar</button><button type="button" class="btn btn--filled" data-tags-save>Salvar</button></div>`;
}
app.addEventListener("click", (e) => {
  if (!e.target.closest("[data-tags-open]")) return;
  tagEdit = { tags: Object.fromEntries(Object.keys(BOARD.tags || {}).map((t) => [t, [...K.tagAreas(BOARD, t)]])), open: null };
  tagsDialog.open(`Tags do ${BOARD.name}`); drawTags();
});
$("#tags-dialog").addEventListener("click", (e) => {
  if (!tagEdit) return;
  const row = e.target.closest("[data-tag]"), t = row?.dataset.tag;
  if (e.target.closest("[data-tag-edit]")) { tagEdit.open = tagEdit.open === t ? null : t; return drawTags(); }
  if (e.target.closest("[data-tag-remove]")) { delete tagEdit.tags[t]; if (tagEdit.open === t) tagEdit.open = null; return drawTags(); }
  const ar = e.target.closest("[data-tag-area]");
  if (ar) { const as = tagEdit.tags[t], id = ar.dataset.tagArea; tagEdit.tags[t] = as.includes(id) ? as.filter((x) => x !== id) : [...as, id]; return drawTags(); }
  if (e.target.closest("[data-tags-cancel]")) { tagEdit = null; return tagsDialog.close(); }
  if (e.target.closest("[data-tags-save]")) { const tags = tagEdit.tags; tagEdit = null; tagsDialog.close(); act("tags", { board: cur, tags }, "Tags salvas"); }
});
$("#tags-dialog").addEventListener("submit", (e) => {
  e.preventDefault(); if (!tagEdit) return;
  const name = $("#tag-new").value.trim().replace(/,/g, "");
  if (!name || name in tagEdit.tags) return;
  tagEdit.tags[name] = []; tagEdit.open = name; drawTags();
  $("#tag-new").focus();
});

// Com `vk serve`: os arquivos de agora (e quem está conectado). Sem servidor, o retrato do build.
api("/api/board").then(apply).catch(() => {}).finally(render);
