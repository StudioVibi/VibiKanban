// VibiKanban: o app do time. Todo o visual é da Bend-UI; este arquivo não tem CSS.
// Os dados são os quadros em boards/<quadro>/ no repositório. Com `vk serve`, cada mudança vira um commit (e um push, com --push).
// Aberto sem o servidor (num artefato, por exemplo), mostra o retrato do build e as mudanças ficam só na página.
import { theme, initSegmented, announce, avatar, avatars } from "./bend-ui/ui.js";
import { createDialog } from "./bend-ui/workspace.js";
import { card as CARD, initBoard, cardCheck, newCard, fitField, formCard } from "./bend-ui/board.js";
import SRC from "./sources.js";
import * as K from "./lib/board.mjs";
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
  <div class="toolbar toolbar--float toolbar--dock" role="toolbar" aria-label="Quadro" id="dock"></div>
</div>
<dialog id="card-dialog"><header class="dialog__header"><h2 class="section-title" id="card-dialog-title"></h2><button class="btn btn--ghost btn--sm btn--icon" id="card-dialog-close" aria-label="Fechar"><svg class="icon"><use href="#i-x"/></svg></button></header><div class="dialog__body" id="card-dialog-body"></div></dialog>`;

const board = $("#board");
const dialog = createDialog($("#card-dialog"), { title: $("#card-dialog-title"), body: $("#card-dialog-body"), close: $("#card-dialog-close") });

function renderHead() {
  // O cabeçalho do quadro (.board__head da lib): o nome do quadro à esquerda; à direita a foto do GitHub de quem
  // está conectado, que abre o menu com o @ e Sair. A linha embaixo é o .separator.
  $("#bar").innerHTML = `<div class="board__head"><h1 class="section-title">${esc(BOARD.name)}</h1><div class="toolbar__spacer"></div>
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
const tagHtml = (c) => `<span class="tag tag--${BOARD.tags[c.tag]}">${esc(c.tag)}</span>`;
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
    <div class="segmented" data-manual role="group" aria-label="Visão"><button type="button" aria-pressed="true"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-columns-2"/></svg><span>${esc(BOARD.name)}</span></button></div>
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
  if (user) { renderHead(); renderBoard(); renderDock(); }
}

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

// ---------- Cartão aberto: ler sempre; editar com login ----------
const choice = (name, label, options, value) => `
  <div class="field"><span class="field__label">${label}</span>
    <div class="segmented" role="group" aria-label="${label}" data-name="${name}">${options.map(([v, l]) => `<button type="button" data-value="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join("")}</div>
  </div>`;
function openCard(id) {
  const c = cards.find((x) => x.id === id); if (!c) return;
  const body = dialog.open(`${c.id}`);
  body.innerHTML = `
    <form class="form" novalidate>
      <label class="field" for="card-title"><span class="field__label">Título</span><input id="card-title" name="title" class="input" value="${esc(c.title)}"></label>
      ${choice("lane", "Coluna", BOARD.lanes.map((l) => [l.id, l.name]), c.lane)}
      ${choice("tag", "Tag", Object.keys(BOARD.tags).map((t) => [t, t]), c.tag)}
      <label class="field" for="card-who"><span class="field__label">Pessoa</span><input id="card-who" name="who" class="input" value="${esc(c.who)}"></label>
      <label class="field" for="card-notes"><span class="field__label">Notas</span><textarea id="card-notes" name="notes" class="input" rows="6">${esc(c.notes || "")}</textarea></label>
      <div class="actions">
        <button class="btn btn--plain btn--danger" type="button" data-remove>Remover</button><div class="toolbar__spacer"></div><button class="btn btn--ghost" type="button" data-cancel>Cancelar</button><button class="btn btn--filled" type="submit">Salvar</button>
      </div>
    </form>`;
  const form = $("form", body), picked = { lane: c.lane, tag: c.tag };
  for (const g of body.querySelectorAll(".segmented")) { initSegmented(g); g.addEventListener("change", (e) => (picked[g.dataset.name] = e.detail.dataset.value)); }
  $("[data-cancel]", body)?.addEventListener("click", () => dialog.close());
  $("[data-remove]", body)?.addEventListener("click", () => { dialog.close(); act("remove", { id }, `${id} removido`); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form);
    dialog.close();
    act("update", { id, title: d.get("title"), who: d.get("who"), notes: d.get("notes"), ...picked }, `${id} salvo`);
  });
  $("#card-title", body).focus();
}

// Com `vk serve`: os arquivos de agora (e quem está conectado). Sem servidor, o retrato do build.
api("/api/board").then(apply).catch(() => {}).finally(render);
