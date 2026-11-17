// Workload do VibiKanban: a roda das áreas, com uma formiga pra cada pessoa em cada skill em que ela trabalha, e a barra de carga.
// Os números, a regra das cores e as posições vêm do WORKLOAD.bend; este arquivo lê tamanhos e dados, pergunta ao Bend e desenha.
// Usa só peças que a Bend-UI já tem (avatar, ícones, tokens); o que é só do workload fica em workload.css.
//
//   import { mountWheel, loadBar, loadKey, skillColor, areaColor } from "./workload/workload.js";
//   const wheel = mountWheel(el, { areas, skills, people }, { tip: (person, skill, n) => "…", onPick: (id) => {} });
//   wheel.update(data); wheel.focus(id | null);
//   loadBar(el, [[{ n: 2, state: "doing", color }, …], …], { total })   // one inner list per area
//
// areas:  [{ id, name, color: "#hex", icon, tool }]   tool: "brush" | "wrench" | "clipboard" | "briefcase" | "megaphone"
// skills: [{ name, mix: { areaId: weight, … } }]
// people: [{ id, name, src, skills: { skillName: openTasks } }]
import "../bend-ui/ui.js";
import { avatar } from "../bend-ui/ui.js";
import "./workload.css";
import W from "./WORKLOAD.bend";

const px = (n) => n + "px";
const root = document.documentElement.style;
for (const [key, value] of Object.entries(W)) if (key.startsWith("workload_") && typeof value === "function" && value.length === 0 && typeof value() === "number") root.setProperty("--" + key.replace(/_/g, "-"), px(value()));

const list = (xs) => xs.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const yes = (b) => b === true || b?.$ === "True";
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- Color ----------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lab = (h) => { const [r, g, b] = rgb(h); return [W.lab_l(r, g, b), W.lab_a(r, g, b), W.lab_b(r, g, b)]; };
const hex = ([l, a, b]) => "#" + [W.rgb_r(l, a, b), W.rgb_g(l, a, b), W.rgb_b(l, a, b)].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
// A blend of colors: [[hex, weight], …], halfway as the eye sees it (OKLab).
export function mix(parts) {
  const labs = parts.map(([h]) => lab(h)), ws = parts.map(([, w]) => w);
  return hex([0, 1, 2].map((i) => W.blend(list(labs.map((x) => x[i])), list(ws))));
}
export const tint = (h, k) => mix([[h, k], ["#ffffff", 1 - k]]);
export const areaColor = (n) => W[`area_color_${n}`]?.() ?? W.area_color_1();
const hueOf = (h) => { const [, a, b] = lab(h); return W.hue(a, b); };
// A skill's color: its areas blend only when their hues are near; a far area only darkens the main one. Never a false grey.
export function skillColor(parts) {
  const ps = parts.filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);
  if (!ps.length) return W.far_ink();
  const main = ps[0][0], h0 = hueOf(main);
  const near = ps.filter(([h]) => yes(W.is_near(W.hue_gap(h0, hueOf(h)))));
  const base = near.length > 1 ? mix(near) : main;
  return near.length < ps.length ? mix([[base, 1 - W.far_shade()], [W.far_ink(), W.far_shade()]]) : base;
}

// ---------- The ant ----------
// The tool says the area; the body takes the skill's color.
const TOOLS = {
  brush: (c) => `<line x1="44" y1="48" x2="54" y2="19" stroke="#a8713f" stroke-width="4" stroke-linecap="round"/><line x1="54" y1="19" x2="55.6" y2="14.5" stroke="#c9ccd6" stroke-width="5.5"/><path d="M53.5 15Q54 5 60 2Q61 10 58 16Z" fill="${c.light}" stroke="${c.dark}" stroke-width="1.2"/><circle cx="60" cy="19" r="1.6" fill="${c.light}"/>`,
  wrench: () => `<line x1="44" y1="48" x2="53" y2="22" stroke="#8f98ab" stroke-width="4.5" stroke-linecap="round"/><circle cx="54.5" cy="17" r="6" fill="#aab2c3"/><rect x="52.6" y="9" width="3.8" height="7" rx="1" fill="#ffffff" transform="rotate(20 54.5 17)"/>`,
  clipboard: (c) => `<rect x="43" y="27" width="16" height="20" rx="2.5" fill="#c08a4a"/><rect x="45.5" y="30.5" width="11" height="14" rx="1" fill="#ffffff"/><rect x="47.5" y="25" width="7" height="4" rx="1.5" fill="#8f98ab"/><path d="M47.5 35h7M47.5 38.5h7M47.5 42h4" stroke="${c.body}" stroke-width="1.5" stroke-linecap="round"/>`,
  briefcase: () => `<path d="M47 34v-3q0-2 2-2h6q2 0 2 2v3" fill="none" stroke="#5a3d24" stroke-width="2"/><rect x="42" y="34" width="20" height="14" rx="2.5" fill="#7a5332"/><rect x="42" y="39" width="20" height="2" fill="#5a3d24"/><rect x="50.5" y="38" width="3" height="4" rx="1" fill="#e8c66a"/>`,
  megaphone: (c) => `<path d="M44 37L58 29L58 47Z" fill="${c.light}" stroke="${c.dark}" stroke-width="1.2" stroke-linejoin="round"/><rect x="41" y="35" width="5" height="6" rx="1.5" fill="${c.dark}"/><path d="M60.5 33q2.5 5 0 10" fill="none" stroke="${c.dark}" stroke-width="1.5" stroke-linecap="round"/>`,
};
export function ant(color, tool) {
  const c = { body: color, dark: mix([[color, 0.62], [W.far_ink(), 0.38]]), light: tint(color, 0.5) };
  return `<svg class="wheel__sprite" viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="61.5" rx="13" ry="2.4" fill="#000000" fill-opacity="0.1"/>
    <path d="M25 50l-7 6M39 50l7 6M27 56l-4 5M37 56l4 5" stroke="${c.dark}" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="32" cy="53" rx="10" ry="8" fill="${c.dark}"/><ellipse cx="32" cy="42" rx="7.5" ry="5.5" fill="${c.body}"/>
    <path d="M26 42l-7 4M38 42l7-1" stroke="${c.dark}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M27 14Q22 4 16 5M37 14Q42 4 48 5" fill="none" stroke="${c.dark}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="16" cy="5" r="3" fill="${c.dark}"/><circle cx="48" cy="5" r="3" fill="${c.dark}"/>
    <circle cx="32" cy="25" r="14" fill="${c.body}"/><ellipse cx="26" cy="18.5" rx="5" ry="2.6" fill="${c.light}" fill-opacity="0.7"/>
    <ellipse cx="26.5" cy="26" rx="3.6" ry="4.4" fill="#ffffff"/><ellipse cx="37.5" cy="26" rx="3.6" ry="4.4" fill="#ffffff"/>
    <circle cx="27.4" cy="27" r="2.1" fill="#1d1630"/><circle cx="38.4" cy="27" r="2.1" fill="#1d1630"/>
    <circle cx="28.1" cy="26.1" r=".75" fill="#ffffff"/><circle cx="39.1" cy="26.1" r=".75" fill="#ffffff"/>
    <ellipse cx="22.5" cy="31.5" rx="2.4" ry="1.3" fill="#ff8fb0" fill-opacity="0.55"/><ellipse cx="41.5" cy="31.5" rx="2.4" ry="1.3" fill="#ff8fb0" fill-opacity="0.55"/>
    <path d="M30 32.2q2 1.8 4 0" fill="none" stroke="#1d1630" stroke-width="1.3" stroke-linecap="round"/>
    <g class="wheel__tool">${(TOOLS[tool] ?? TOOLS.brush)(c)}</g></svg>`;
}

// ---------- The load bar (canvas, so every pixel lands where it should) ----------
const DPR = () => Math.max(2, Math.ceil(window.devicePixelRatio || 1));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function paintPiece(ctx, x, y, w, h, state, color) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const hatch = (base, angle, period, line) => {
    ctx.fillStyle = tint(color, base); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = line; ctx.beginPath();
    for (let k = W.hatch_first(x, h, period); k <= W.hatch_last(x, w, period); k++) {
      const x0 = k * period;
      if (angle > 90) { ctx.moveTo(x0, y); ctx.lineTo(x0 + h, y + h); } else { ctx.moveTo(x0, y + h); ctx.lineTo(x0 + h, y); }
    }
    ctx.stroke();
  };
  if (state === "review") hatch(W.review_base(), W.review_angle(), W.review_period(), W.review_line());
  else if (state === "backlog") hatch(W.backlog_base(), W.backlog_angle(), W.backlog_period(), W.backlog_line());
  else { ctx.fillStyle = state === "done" ? tint(color, W.done_base()) : color; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
function drawBar(el, groups, total, gapped = true) {
  const w = Math.floor(el.getBoundingClientRect().width), h = W.workload_bar_height(), gap = gapped ? W.workload_bar_area_gap() : 0, dpr = DPR();
  if (w < h) return;
  const c = document.createElement("canvas");
  c.width = w * dpr; c.height = h * dpr; c.style.width = px(w); c.style.height = px(h); c.style.display = "block";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  const snap = (v) => Math.round(v * dpr) / dpr;
  const n = groups.flat().reduce((t, p) => t + p.n, 0), unit = W.bar_unit(w, n, Math.max(total, n, 1), groups.length, gap);
  let cx = 0;
  groups.forEach((g, gi) => {
    if (gi) cx += gap;
    const k = g.reduce((t, p) => t + p.n, 0), gx0 = snap(cx), gx1 = snap(cx + W.area_width(k, unit, h));
    ctx.save(); ctx.beginPath(); ctx.roundRect(gx0, 0, gx1 - gx0, h, h / 2); ctx.clip();   // each area is its own capsule
    let at = gx0;
    for (const p of g) { const x1 = snap(at + (p.n / k) * (gx1 - gx0)); paintPiece(ctx, at, 0, x1 - at, h, p.state, p.color); at = x1; }
    ctx.restore();
    cx = gx1;
  });
  const tx = n ? snap(cx + gap) : 0;   // the track: one more capsule, after the last cut
  if (w - tx >= h) { ctx.fillStyle = css("--surface-2"); ctx.beginPath(); ctx.roundRect(tx, 0, w - tx, h, h / 2); ctx.fill(); }
  el.replaceChildren(c);
}
const watched = new WeakMap();
const sizes = new ResizeObserver((entries) => { for (const e of entries) watched.get(e.target)?.(); });
// groups: [[{ n, state: "doing" | "review" | "backlog" | "done", color }, …], …], one inner list per area. total: what the full width holds.
export function loadBar(el, groups, { total = 0 } = {}) {
  el.classList.add("load-bar");
  const draw = () => drawBar(el, groups, total);
  watched.set(el, draw); sizes.observe(el); draw();
}
// A key swatch: the same paint, one small capsule.
export function loadKey(el, state, color) {
  el.classList.add("load-key__swatch");
  const draw = () => drawBar(el, [[{ n: 1, state, color: color ?? css("--text-2") }]], 1, false);
  watched.set(el, draw); sizes.observe(el); draw();
}

// ---------- The wheel ----------
export function mountWheel(el, data, { tip = (p, s, n) => `${n} · ${s}`, onPick = () => {} } = {}) {
  el.classList.add("wheel");
  let D = data, focused = null;
  const field = document.createElement("div"); field.className = "wheel__field"; el.append(field);

  function layout() {
    const areas = D.areas, n = areas.length, idx = new Map(areas.map((a, i) => [a.id, i]));
    // Each skill: the weighted middle of its areas' poles, pulled in, then spread from the others in its main area.
    const skills = D.skills.map((s) => {
      const ws = Object.entries(s.mix).filter(([a, w]) => idx.has(a) && w > 0);
      const main = ws.sort((a, b) => b[1] - a[1])[0]?.[0];
      return { ...s, ws, main, color: skillColor(ws.map(([a, w]) => [areas[idx.get(a)].color, w])) };
    }).filter((s) => s.main);
    for (const s of skills) {
      const i = idx.get(s.main), same = skills.filter((x) => x.main === s.main), k = same.indexOf(s), t = W.pole_turn(i, n);
      const ws = list(s.ws.map(([, w]) => w));
      s.x = W.pulled(W.blend(list(s.ws.map(([a]) => W.pole_x(idx.get(a), n))), ws)) + W.spread_x(t, k, same.length);
      s.y = W.pulled(W.blend(list(s.ws.map(([a]) => W.pole_y(idx.get(a), n))), list(s.ws.map(([, w]) => w)))) + W.spread_y(t, k, same.length);
    }
    // Nenhuma pílula em cima de outra nem do nome de uma área: as que estão perto demais se afastam (as áreas não saem do lugar).
    const box = el.getBoundingClientRect(), ratio = box.height ? box.width / box.height : 1.6;
    // O nome de uma área ocupa uma faixa: à direita da roda ele cresce pra esquerda do ponto, à esquerda cresce pra direita.
    const label = (a) => Math.min(0.2, (a.name.length * 9 + 40) / Math.max(box.width, 1));
    const poles = areas.map((a, i) => { const x = W.pole_x(i, n), w = label(a); return [x > 0.6 ? x - w / 2 : x < 0.4 ? x + w / 2 : x, W.pole_y(i, n), w]; });
    for (let it = 0; it < 120; it++) {
      for (let i = 0; i < skills.length; i++) {
        for (let j = i + 1; j < skills.length; j++) push(skills[i], skills[j], 0.15, true);
        for (const [px, py, w] of poles) push(skills[i], { x: px, y: py - 0.05 }, 0.1 + w / 2, false);   // conta a formiga embaixo da pílula
      }
    }
    // As formigas ficam penduradas embaixo da pílula: na vertical, cada uma precisa de mais espaço.
    function push(a, b, min, both) {
      const dx = (b.x - a.x) * ratio, dy = (b.y - a.y) * 1.5, d = Math.hypot(dx, dy);
      if (d >= min) return;
      const ux = d ? dx / d : 1, uy = d ? dy / d : 0, k = both ? (min - d) / 2 : min - d;
      a.x -= (ux * k) / ratio; a.y -= (uy * k) / 1.5;
      if (both) { b.x += (ux * k) / ratio; b.y += (uy * k) / 1.5; }
    }
    for (const s of skills) { s.x = Math.min(0.94, Math.max(0.06, s.x)); s.y = Math.min(0.92, Math.max(0.08, s.y)); }
    const ants = [];
    for (const s of skills) {
      const here = D.people.filter((p) => (p.skills[s.name] || 0) > 0);
      here.forEach((p, i) => ants.push({ p, s, n: p.skills[s.name], dx: W.presence_dx(i, here.length), dy: W.presence_dy(s.y) }));
    }
    return { areas, skills, ants, n };
  }

  function draw() {
    const { areas, skills, ants, n } = layout();
    const step = 360 / Math.max(n, 1);
    field.style.background = n ? `conic-gradient(from ${-step}deg at 50% 50%, ${areas.map((a, i) => `${tint(a.color, 0.13)} ${i * step}deg ${(i + 1) * step}deg`).join(",")})` : "";
    for (const x of el.querySelectorAll(".wheel__pole, .wheel__skill")) x.remove();
    el.insertAdjacentHTML("beforeend", areas.map((a, i) => {
      const x = W.pole_x(i, n), y = W.pole_y(i, n), tx = x > 0.6 ? "-100%" : x < 0.4 ? "0%" : "-50%";
      return `<span class="wheel__pole" style="--area:${a.color};left:${x * 100}%;top:${y * 100}%;transform:translate(${tx},-50%)"><span class="wheel__pole-icon"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-${a.icon}"/></svg></span>${esc(a.name)}</span>`;
    }).join("") + skills.map((s) => `<span class="wheel__skill" data-skill="${esc(s.name)}" style="--skill:${s.color};left:${s.x * 100}%;top:${s.y * 100}%">${esc(s.name)}</span>`).join(""));
    // Ants: keep the ones already there so they glide to their new place.
    const keep = new Set();
    for (const a of ants) {
      const key = `${a.p.id}|${a.s.name}`; keep.add(key);
      const area = areas.find((x) => x.id === a.s.main);
      let node = [...el.querySelectorAll(".wheel__ant")].find((x) => x.dataset.key === key);
      if (!node) {
        node = document.createElement("div"); node.className = "wheel__ant"; node.dataset.key = key; node.dataset.id = a.p.id; node.tabIndex = 0;
        el.append(node);
      }
      node.style.cssText = `left:calc(${a.s.x * 100}% + ${a.dx}px);top:calc(${a.s.y * 100}% + ${a.dy}px);--size:${W.ant_size(a.n)}px;--delay:${-((a.dx + a.s.x * 997) % 2)}s`;
      node.setAttribute("aria-label", `${a.p.name} · ${tip(a.p, a.s.name, a.n)}`);
      node.innerHTML = `${ant(a.s.color, area?.tool)}<span class="wheel__badge">${avatar({ name: a.p.name, src: a.p.src })}</span><span class="wheel__tip">${avatar({ name: a.p.name, src: a.p.src })}<span><b>${esc(a.p.name)}</b><span class="detail">${esc(tip(a.p, a.s.name, a.n))}</span></span></span><span class="wheel__name">${esc(a.p.name)}</span>`;
    }
    for (const x of el.querySelectorAll(".wheel__ant")) if (!keep.has(x.dataset.key)) x.remove();
    paintFocus();
  }
  // Focus: only that person and the skills they work in stay; everything else steps back.
  function paintFocus() {
    const mine = new Set(focused ? Object.entries(D.people.find((p) => p.id === focused)?.skills ?? {}).filter(([, k]) => k > 0).map(([s]) => s) : []);
    for (const x of el.querySelectorAll(".wheel__ant")) { x.classList.toggle("is-on", !!focused && x.dataset.id === focused); x.classList.toggle("is-off", !!focused && x.dataset.id !== focused); }
    for (const x of el.querySelectorAll(".wheel__skill")) x.classList.toggle("is-off", !!focused && !mine.has(x.dataset.skill));
  }
  el.addEventListener("pointerover", (e) => { const a = e.target.closest(".wheel__ant"); if (a && a.dataset.id !== focused) api.focus(a.dataset.id, "hover"); });
  el.addEventListener("pointerleave", () => { if (hoverOnly) api.focus(null); });
  el.addEventListener("click", (e) => { const a = e.target.closest(".wheel__ant"); if (a) onPick(a.dataset.id); });
  el.addEventListener("keydown", (e) => { const a = e.target.closest(".wheel__ant"); if (a && e.key === "Enter") onPick(a.dataset.id); });
  let hoverOnly = false;
  const api = {
    update(next) { D = next; draw(); },
    focus(id, how) { focused = id; hoverOnly = how === "hover" && !!id; paintFocus(); },
    get focused() { return focused; },
  };
  draw();
  return api;
}
