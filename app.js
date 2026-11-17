// VibiKanban: o app do time. Todo o visual é da Bend-UI; este arquivo não tem CSS.
// Os dados são os quadros em boards/<quadro>/ no repositório. Com `vk serve`, cada mudança vira um commit (e um push, com --push).
// Aberto sem o servidor (num artefato, por exemplo), mostra o retrato do build e as mudanças ficam só na página.
import { theme, initSegmented, announce, avatar, avatars } from "./bend-ui/ui.js";
import { createDialog } from "./bend-ui/workspace.js";   // o .dialog da lib
import { card as CARD, initBoard, cardCheck, newCard, fitField, formCard, cardDialog } from "./bend-ui/board.js";
import SRC from "./sources.js";
import * as K from "./lib/board.mjs";
import AREAS from "./workload/areas.js";
import WL from "./workload/WORKLOAD.bend";
import { mountWheel, loadBar, loadKey, areaColor, skillColor } from "./workload/workload.js";
// A Allo mora aqui no repositório (fonts/allo, licença OFL): não depende de nenhum site de fontes.
import allo from "./fonts/allo/AlloVariable.woff2";

const ALLO = { family: "Allo", src: allo, weight: "100 900" };
theme({ mode: "light", fontSans: ALLO, fontDisplay: ALLO });   // sempre claro, independente do computador

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- Estado ----------
let BOARDS = SRC.repo.boards.map((b) => ({ slug: b.slug, board: JSON.parse(b.board), cards: b.cards.map(K.parseCard) }));
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

async function api(path, input) {
  const r = await fetch(path, { method: input ? "POST" : "GET", headers: { "content-type": "application/json" }, body: input ? JSON.stringify(input) : undefined });
  const j = await r.json();
  if (r.status === 401) user = null;   // a sessão caiu: volta pro botão de entrar
  if (!r.ok) throw new Error(j.error);
  return j;
}
// auth: "github" no site (login de verdade, grava no GitHub); "local" com o vk serve no computador.
function apply(snap) { if (snap.boards) { BOARDS = snap.boards; select(want ?? cur); } user = snap.user; auth = snap.auth; live = true; }

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
  catch (e) { announce(e.message); return render(); }
  if (!keep) render();
  if (!live) return announce(said);
  waiting++;
  queue = queue.then(() => api("/api/" + kind, input))
    .then((snap) => {
      // Só redesenha se o servidor trouxe algo diferente do que já está na tela (não corta a animação do cartão novo).
      if (--waiting === 0) { const same = !!snap.boards && files(snap.boards) === files(BOARDS); apply(snap); if (!keep && !same && !typing()) render(); }
      announce(said);
    },
      (e) => { waiting--; BOARDS = before; select(cur); announce(e.message); render(); api("/api/board").then((s) => { apply(s); render(); }).catch(() => {}); });
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
  const who = S.who ? `<span class="detail card__who">@${esc(c.who)}</span>` : "";
  const foot = who || tagFoot ? `<div class="card__foot">${CARD.footOrder === "who_tag" ? who + tagFoot : tagFoot + who}</div>` : "";
  const moves = BOARD.lanes.filter((l) => l.id !== c.lane).map((l) => `<button class="menu__item" role="menuitem" data-move="${l.id}"><svg class="icon icon--sm"><use href="#i-arrow-right"/></svg><span>Mover para ${esc(l.name)}</span></button>`).join("");
  return `<article class="card${c.done ? " is-done" : ""}" data-id="${c.id}" tabindex="0" aria-label="${esc(c.id + ": " + c.title)}">
    <div class="card__head">
      <span class="card__lead">${S.id ? `<span class="tag tag--mono">${c.id}</span>` : ""}${tagTop}</span>
      ${S.menu ? `<div class="dropdown">
        <button class="btn btn--plain btn--neutral btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Ações de ${c.id}"><svg class="icon"><use href="#i-ellipsis"/></svg></button>
        <div class="menu menu--end" role="menu" hidden><button class="menu__item" role="menuitem" data-open><svg class="icon icon--sm"><use href="#i-pencil"/></svg><span>Abrir</span></button>${moves}<hr class="separator"><button class="menu__item" role="menuitem" data-remove><svg class="icon icon--sm"><use href="#i-trash-2"/></svg><span>Remover</span></button></div>
      </div>` : ""}
    </div>
    <p class="${CARD.titleRole} card__title">${cardCheck(c.done, { labels: CHECK })}${esc(c.title).replace(/`([^`]+)`/g, '<code class="mono">$1</code>')}</p>
    ${foot}
  </article>`;
}
function renderBoard() {
  board.innerHTML = BOARD.lanes.map((l) => `
    <section class="lane" data-lane="${l.id}" aria-label="${esc(l.name)}">
      <header class="lane__head"><h2 class="group-title">${esc(l.name)}</h2><span class="tag">${inLane(l.id).length}</span></header>
      <div class="lane__cards">${inLane(l.id).map(cardHtml).join("")}</div>
      <div class="lane__add"><button class="btn btn--plain btn--neutral btn--sm" data-add><svg class="icon icon--sm"><use href="#i-plus"/></svg>Adicionar cartão</button></div>
    </section>`).join("");
}
// ---------- Menu flutuante: o quadro aberto e "Mudar de quadro" ----------
// A lista é o .menu da lib; data-open="hover" abre no hover e data-motion="rise" faz as linhas subirem
// uma depois da outra. Cada quadro mostra as fotos do GitHub de quem tem cartão nele.
const HEADS_MAX = 3;   // quantas fotos antes do +N: não decidido
const photo = (login) => ({ name: login, src: `https://github.com/${encodeURIComponent(login)}.png?size=48` });
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
// A roda mostra só as tags que os cartões do quadro usam, e só as áreas dessas tags.
const firstTag = (c) => (c.tags || [])[0];
function wlSkills() {
  const used = [...new Set(cards.flatMap((c) => c.tags || []))];
  return used.map((name) => { const as = K.tagAreas(BOARD, name).filter((a) => AREA[a]); return { name, mix: Object.fromEntries(as.map((a) => [a, 1])), main: as[0], color: tagColor(name) }; }).filter((s) => s.main);
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
  const mine = cards.filter((c) => c.who === login);
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
  const data = { areas: wlAreas(), skills, people: people.map((l) => ({ id: l, name: l, src: photo(l).src, skills: Object.fromEntries(skills.map((s) => [s.name, cards.filter((c) => c.who === l && (c.tags || []).includes(s.name) && !K.isDone(c)).length])) })) };
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
$("#wl-side").addEventListener("pointerover", (e) => { const p = e.target.closest("[data-wl-person]"); if (p && wheel) wheel.focus(p.dataset.wlPerson, "hover"); });
$("#wl-side").addEventListener("pointerleave", () => wheel?.focus(wlOn));

function move(id, lane, before = null) {
  const c = cards.find((x) => x.id === id); if (!c || before === id) return render();
  if (c.lane === lane) { const xs = inLane(lane); if ((xs[xs.indexOf(c) + 1]?.id ?? null) === (before ?? null)) return render(); }   // soltou onde estava
  act("move", { id, lane, before }, c.lane === lane ? `${id} reordenado` : `${id} movido para ${laneName(lane)}`);
}
// Arrastar: da Bend-UI. O cartão levanta, os outros abrem espaço e ele assenta com a mola do MOTION.bend.
// Concluir: também da Bend-UI. O cartão fica onde está; o arquivo dele ganha done: true.
initBoard(board, {
  onDrop: (id, lane, before) => move(id, lane, before),
  labels: CHECK,
  onDone: (id, done) => act("update", { id, done }, done ? `${id} concluído` : `${id} reaberto`, true),
});

board.addEventListener("pick", (e) => {
  const id = e.target.closest(".card").dataset.id, item = e.detail;
  if (item.dataset.move) move(id, item.dataset.move);
  if ("open" in item.dataset) openCard(id);
  if ("remove" in item.dataset) act("remove", { id }, `${id} removido`);
});
// Clicar no cartão (ou Enter nele) abre o cartão.
board.addEventListener("click", (e) => {
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
// Já abre grande; o título e as notas se editam ali mesmo e a caixa cresce com o texto. Coluna, tag e pessoa
// são botões que abrem o .menu da lib. Salvar grava; Cancelar, Esc ou um clique fora fecham sem gravar.
let editing = null;   // { id, pick: { lane, tag, who } }
const ICON = (name) => `<svg class="icon icon--sm" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const tagChip = tagPill;
const SHOW = {
  lane: (v) => `${ICON("columns-2")}<span>${esc(laneName(v))}</span>`,
  tags: (v) => (v.length ? `<span class="tag-pills">${v.map(tagChip).join("")}</span>` : "<span>Sem tag</span>"),
  who: (v) => (v ? `${avatar(photo(v))}<span>@${esc(v)}</span>` : `${ICON("user")}<span>Ninguém</span>`),
};
const choiceItem = (kind, v, label) => `<button type="button" class="menu__item" role="${kind === "tags" ? "menuitemcheckbox" : "menuitemradio"}" aria-checked="${kind === "tags" ? editing.pick.tags.includes(v) : editing.pick[kind] === v}" data-v="${esc(v)}">${label}<svg class="icon icon--sm menu__check" aria-hidden="true"><use href="#i-check"/></svg></button>`;
const choiceMenu = (kind, label, items) => `<div class="dropdown" data-kind="${kind}"><button type="button" class="btn btn--ghost btn--sm" aria-haspopup="menu" aria-expanded="false" aria-label="${label}" data-show>${SHOW[kind](editing.pick[kind])}</button><div class="menu" role="menu" hidden>${items}</div></div>`;
function openCard(id) {
  const c = cards.find((x) => x.id === id); if (!c) return;
  editing = { id, pick: { lane: c.lane, tags: [...(c.tags || [])], who: c.who || "" } };
  const people = [...new Set([user, c.who, ...BOARDS.flatMap((b) => K.people(b.cards).map(([l]) => l))].filter(Boolean))];
  dialogEl.setAttribute("aria-label", `${c.id}: ${c.title}`);
  dialogEl.innerHTML = `
    <header class="dialog__header"><span class="tag tag--mono">${c.id}</span><div class="toolbar__spacer"></div>
      <div class="dropdown"><button type="button" class="btn btn--ghost btn--sm btn--icon" aria-haspopup="menu" aria-expanded="false" aria-label="Ações de ${c.id}"><svg class="icon"><use href="#i-ellipsis"/></svg></button>
        <div class="menu menu--end" role="menu" hidden><button type="button" class="menu__item" role="menuitem" data-remove>${ICON("trash-2")}<span>Remover</span></button></div></div>
      <button type="button" class="btn btn--ghost btn--sm btn--icon" data-close aria-label="Fechar"><svg class="icon"><use href="#i-x"/></svg></button></header>
    <div class="card-dialog__body">
      <textarea class="card-dialog__field card-dialog__title" rows="1" aria-label="Título">${esc(c.title)}</textarea>
      <div class="card-dialog__data">
        ${choiceMenu("lane", "Coluna", BOARD.lanes.map((l) => choiceItem("lane", l.id, `<span>${esc(l.name)}</span>`)).join(""))}
        ${choiceMenu("tags", "Tags", Object.keys(BOARD.tags).map((t) => choiceItem("tags", t, tagChip(t))).join(""))}
        ${choiceMenu("who", "Pessoa", choiceItem("who", "", "<span>Ninguém</span>") + people.map((p) => choiceItem("who", p, `${avatar(photo(p))}<span>@${esc(p)}</span>`)).join(""))}
      </div>
      <textarea class="card-dialog__field card-dialog__notes" rows="1" aria-label="Notas" placeholder="Adicionar notas…">${esc(c.notes || "")}</textarea>
    </div>
    <div class="actions"><button type="button" class="btn btn--ghost" data-close>Cancelar</button><button type="button" class="btn btn--filled" data-save>Salvar</button></div>`;
  dialog.open();
}
dialogEl.addEventListener("pick", (e) => {
  if (!editing) return;
  if ("remove" in e.detail.dataset) { const id = editing.id; editing = null; dialog.close(); return act("remove", { id }, `${id} removido`); }
  const dd = e.target.closest(".dropdown[data-kind]"); if (!dd) return;
  const k = dd.dataset.kind, v = e.detail.dataset.v;
  if (k === "tags") { const ts = editing.pick.tags; editing.pick.tags = ts.includes(v) ? ts.filter((x) => x !== v) : [...ts, v]; for (const it of dd.querySelectorAll(".menu__item")) it.setAttribute("aria-checked", String(editing.pick.tags.includes(it.dataset.v))); }
  else editing.pick[k] = v;
  $("[data-show]", dd).innerHTML = SHOW[k](editing.pick[k]);
});
dialogEl.addEventListener("click", (e) => {
  if (!editing) return;
  if (e.target.closest("[data-close]")) return void dialog.close();
  if (!e.target.closest("[data-save]")) return;
  const c = cards.find((x) => x.id === editing.id), { id, pick } = editing;
  const title = $(".card-dialog__title", dialogEl).value.trim() || c.title, notes = $(".card-dialog__notes", dialogEl).value;
  editing = null; dialog.close();
  act("update", { id, title, notes, ...pick }, `${id} salvo`);
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
