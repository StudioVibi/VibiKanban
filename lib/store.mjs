// Lê e escreve o board no disco. Toda mudança regenera BOARD.md e, se a pasta é um repositório git, vira um commit.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { parseCard, cardMd, boardMd, check } from "./board.mjs";

export function findRoot(from = process.cwd()) {
  for (let d = path.resolve(from); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, "board", "board.json"))) return d;
    if (d === path.dirname(d)) throw new Error("nenhum board/board.json aqui nem nas pastas acima");
  }
}

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export function isRepo(root) { try { return git(root, "rev-parse", "--is-inside-work-tree") === "true"; } catch { return false; } }
export function hasRemote(root) { try { return git(root, "remote").length > 0; } catch { return false; } }

export function load(root) {
  const board = JSON.parse(fs.readFileSync(path.join(root, "board", "board.json"), "utf8"));
  const dir = path.join(root, "board", "cards");
  const cards = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => parseCard(fs.readFileSync(path.join(dir, f), "utf8"))) : [];
  return { board, cards };
}

export const cardPath = (id) => `board/cards/${id}.md`;

// Escreve os cartões que mudaram, apaga os removidos, regenera BOARD.md e faz o commit.
export function save(root, { board, cards }, { changed = [], removed = [], message, who, push = false }) {
  const errors = check(board, cards);
  if (errors.length) throw new Error(errors.join("\n"));
  fs.mkdirSync(path.join(root, "board", "cards"), { recursive: true });
  for (const c of changed) fs.writeFileSync(path.join(root, cardPath(c.id)), cardMd(c));
  for (const c of removed) fs.rmSync(path.join(root, cardPath(c.id)), { force: true });
  fs.writeFileSync(path.join(root, "BOARD.md"), boardMd(board, cards));
  if (!message || !isRepo(root)) return { committed: false };
  const files = ["BOARD.md", ...changed.map((c) => cardPath(c.id))];
  git(root, "add", "--", ...files);
  for (const c of removed) git(root, "rm", "-q", "--cached", "--ignore-unmatch", "--", cardPath(c.id));
  git(root, "commit", "-q", "-m", who ? `${message} (@${who})` : message, "--", ...files, ...removed.map((c) => cardPath(c.id)));
  if (push && hasRemote(root)) { git(root, "pull", "-q", "--rebase", "--autostash"); git(root, "push", "-q"); }
  return { committed: true, hash: git(root, "rev-parse", "--short", "HEAD") };
}

export function history(root, n = 10) {
  if (!isRepo(root)) return [];
  try { return git(root, "log", `-${n}`, "--format=%h %s", "--", "board", "BOARD.md").split("\n").filter(Boolean); } catch { return []; }
}

// Quem está mexendo: o login do GitHub (gh), senão VK_USER, senão o nome do git.
export function whoami(root) {
  if (process.env.VK_USER) return process.env.VK_USER;
  try { return execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }).trim(); } catch {}
  try { return git(root, "config", "user.name"); } catch {}
  return null;
}
