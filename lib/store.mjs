// Lê e escreve os quadros no disco. Toda mudança regenera o BOARD.md do quadro e o BOARDS.md da raiz e,
// se a pasta é um repositório git, vira um commit.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { parseCard, cardMd, boardMd, boardsMd, checkAll } from "./board.mjs";
import { boardJsonPath, cardPath, boardMdPath, INDEX } from "./paths.mjs";

export function findRoot(from = process.cwd()) {
  for (let d = path.resolve(from); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, "boards")) && fs.statSync(path.join(d, "boards")).isDirectory()) return d;
    if (d === path.dirname(d)) throw new Error("nenhuma pasta boards/ aqui nem nas pastas acima");
  }
}

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export function isRepo(root) { try { return git(root, "rev-parse", "--is-inside-work-tree") === "true"; } catch { return false; } }
export function hasRemote(root) { try { return git(root, "remote").length > 0; } catch { return false; } }

// Todos os quadros: [{ slug, board, cards }].
export function load(root) {
  const dir = path.join(root, "boards");
  const boards = fs.readdirSync(dir).filter((s) => fs.existsSync(path.join(root, boardJsonPath(s)))).map((slug) => {
    const board = JSON.parse(fs.readFileSync(path.join(root, boardJsonPath(slug)), "utf8"));
    const cd = path.join(dir, slug, "cards");
    const cards = fs.existsSync(cd) ? fs.readdirSync(cd).filter((f) => f.endsWith(".md")).map((f) => parseCard(fs.readFileSync(path.join(cd, f), "utf8"))) : [];
    return { slug, board, cards };
  });
  return { boards };
}

// Escreve os cartões que mudaram num quadro, apaga os removidos, regenera os .md e faz o commit.
// created: um quadro novo (escreve o board.json dele).
export function save(root, { boards }, slug, { changed = [], removed = [], created = false, message, who, push = false }) {
  const errors = checkAll(boards);
  if (errors.length) throw new Error(errors.join("\n"));
  const b = boards.find((x) => x.slug === slug);
  fs.mkdirSync(path.join(root, "boards", slug, "cards"), { recursive: true });
  const files = [boardMdPath(slug), INDEX];
  if (created) { fs.writeFileSync(path.join(root, boardJsonPath(slug)), JSON.stringify(b.board, null, 2) + "\n"); files.push(boardJsonPath(slug)); }
  for (const c of changed) fs.writeFileSync(path.join(root, cardPath(slug, c.id)), cardMd(c));
  for (const c of removed) fs.rmSync(path.join(root, cardPath(slug, c.id)), { force: true });
  fs.writeFileSync(path.join(root, boardMdPath(slug)), boardMd(b.board, b.cards, slug));
  fs.writeFileSync(path.join(root, INDEX), boardsMd(boards));
  if (!message || !isRepo(root)) return { committed: false };
  files.push(...changed.map((c) => cardPath(slug, c.id)));
  git(root, "add", "--", ...files);
  for (const c of removed) git(root, "rm", "-q", "--cached", "--ignore-unmatch", "--", cardPath(slug, c.id));
  git(root, "commit", "-q", "-m", who ? `${message} (@${who})` : message, "--", ...files, ...removed.map((c) => cardPath(slug, c.id)));
  if (push && hasRemote(root)) { git(root, "pull", "-q", "--rebase", "--autostash"); git(root, "push", "-q"); }
  return { committed: true, hash: git(root, "rev-parse", "--short", "HEAD") };
}

// Regenera todos os .md, sem commit (vk md).
export function writeMd(root, { boards }) {
  for (const b of boards) fs.writeFileSync(path.join(root, boardMdPath(b.slug)), boardMd(b.board, b.cards, b.slug));
  fs.writeFileSync(path.join(root, INDEX), boardsMd(boards));
}

export function history(root, n = 10, slug) {
  if (!isRepo(root)) return [];
  try { return git(root, "log", `-${n}`, "--format=%h %s", "--", slug ? `boards/${slug}` : "boards").split("\n").filter(Boolean); } catch { return []; }
}

// Quem está mexendo: o login do GitHub (gh), senão VK_USER, senão o nome do git.
export function whoami(root) {
  if (process.env.VK_USER) return process.env.VK_USER;
  try { return execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }).trim(); } catch {}
  try { return git(root, "config", "user.name"); } catch {}
  return null;
}
