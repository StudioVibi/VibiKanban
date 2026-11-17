// VibiKanban: o app do time. Todo o visual é da Bend-UI; este arquivo não tem CSS.
// Os dados são os arquivos de board/ no repositório. Com `vk serve`, cada mudança vira um commit (e um push, com --push).
// Aberto sem o servidor (num artefato, por exemplo), mostra o retrato do build e as mudanças ficam só na página.
import { theme, initSegmented, announce } from "./bend-ui/ui.js";
import { createDialog } from "./bend-ui/workspace.js";
import { card as CARD, initBoard, cardCheck } from "./bend-ui/board.js";
import SRC from "./sources.js";
import * as K from "./lib/board.mjs";

theme({ mode: "light" });   // sempre claro, independente do computador

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- Estado ----------
let BOARD = JSON.parse(SRC.repo.board), cards = SRC.repo.cards.map(K.parseCard), user = null, live = false, auth = null;
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
function apply(snap) { if (snap.board) { BOARD = snap.board; cards = snap.cards; } user = snap.user; auth = snap.auth; live = true; }

// Uma mudança: no app real o servidor grava o arquivo e faz o commit; sem servidor, fica só na página.
// keep: a mudança já está na tela (concluir), então não redesenha; só se der erro.
async function act(kind, input, said, keep = false) {
  try {
    if (live) apply(await api("/api/" + kind, input));
    else if (kind === "move") K.move(BOARD, cards, input.id, input.lane, input.before);
    else if (kind === "add") K.add(BOARD, cards, { ...input, who: user });
    else if (kind === "update") K.update(BOARD, cards, input.id, input);
    else K.remove(BOARD, cards, input.id);
    announce(said);
    if (keep) return;
  } catch (e) { announce(e.message); }
  render();
}

// ---------- Página ----------
const app = $("#app");
// Sem login: só o botão do GitHub no meio da tela. Com login: a barra e o board.
app.innerHTML = `
<div class="page-center" id="gate"><button class="btn btn--filled btn--neutral" data-login><svg class="icon"><use href="#i-user"/></svg>Entrar com GitHub</button></div>
<div class="doc doc--full" id="main" hidden>
  <div class="toolbar" id="bar"></div>
  <div class="board" id="board"></div>
</div>
<dialog id="card-dialog"><header class="dialog__header"><h2 class="section-title" id="card-dialog-title"></h2><button class="btn btn--ghost btn--sm btn--icon" id="card-dialog-close" aria-label="Fechar"><svg class="icon"><use href="#i-x"/></svg></button></header><div class="dialog__body" id="card-dialog-body"></div></dialog>`;

const board = $("#board");
const dialog = createDialog($("#card-dialog"), { title: $("#card-dialog-title"), body: $("#card-dialog-body"), close: $("#card-dialog-close") });

function renderHead() {
  // A barra: quem está conectado, à direita.
  $("#bar").innerHTML = `<div class="toolbar__spacer"></div><i class="dot dot--success"></i><span class="tag tag--mono">@${esc(user)}</span><button class="btn btn--plain btn--neutral btn--sm" data-logout>Sair</button>`;
}
app.addEventListener("click", async (e) => {
  const login = e.target.closest("[data-login]"), logout = e.target.closest("[data-logout]");
  if (!login && !logout) return;
  if (login && auth === "github") return void (location.href = "/api/auth/login");   // o GitHub pede o login e volta
  if (live) { try { apply(await api(login ? "/api/login" : "/api/logout", {})); } catch (err) { return announce(err.message); } }
  else user = login ? "isa" : null;
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
function render() {
  $("#gate").hidden = !!user; $("#main").hidden = !user;
  if (user) { renderHead(); renderBoard(); }
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

function addCard(box) {
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
