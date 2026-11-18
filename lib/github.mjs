// O board no GitHub, para o site (work.studiovibi.com): lê e escreve os mesmos arquivos que o vk,
// direto no repositório, com o token de quem está logado. Cada mudança é um commit no nome dessa pessoa.
import { parseCard, cardMd, boardMd, boardsMd, checkAll } from "./board.mjs";
import { cardPath, boardMdPath, boardJsonPath, INDEX } from "./paths.mjs";

const API = () => process.env.GITHUB_API || "https://api.github.com";

async function gh(token, path, { method = "GET", body } = {}) {
  const r = await fetch(API() + path, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "vibikanban", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || `GitHub ${r.status}`), { status: r.status });
  return j;
}
const graphql = async (token, query, variables) => {
  const j = await gh(token, "/graphql", { method: "POST", body: { query, variables } });
  if (j.errors?.length) throw Object.assign(new Error(j.errors.map((e) => e.message).join("; ")), { graphql: j.errors });
  return j.data;
};

export const user = (token) => gh(token, "/user").then((u) => u.login);

// Tudo de uma vez: o commit de agora e todos os quadros (boards/<quadro>/board.json e cards/).
export async function load(token, repo, branch = "main") {
  const [owner, name] = repo.split("/");
  const d = await graphql(token, `query($owner:String!,$name:String!,$ref:String!,$boardsPath:String!){
    repository(owner:$owner,name:$name){
      ref(qualifiedName:$ref){ target{ oid } }
      boards: object(expression:$boardsPath){ ... on Tree { entries { name object { ... on Blob { text } ... on Tree { entries { name object {
        ... on Blob { text }
        ... on Tree { entries { name object { ... on Blob { text } } } }
      } } } } } } }
    }}`, { owner, name, ref: `refs/heads/${branch}`, boardsPath: `${branch}:boards` });
  const r = d.repository;
  if (!r?.ref || !r.boards) throw new Error(`${repo} não tem a pasta boards/ em ${branch}`);
  const boards = r.boards.entries.map((e) => {
    const files = e.object?.entries ?? [], json = files.find((f) => f.name === "board.json")?.object?.text;
    if (json == null) return null;
    const cards = (files.find((f) => f.name === "cards")?.object?.entries ?? []).filter((c) => c.name.endsWith(".md") && c.object?.text != null).map((c) => parseCard(c.object.text));
    return { slug: e.name, board: JSON.parse(json), cards };
  }).filter(Boolean);
  // Os membros IA: boards/members.json, um arquivo solto em boards/ (não é quadro).
  const mt = r.boards.entries.find((e) => e.name === "members.json")?.object?.text;
  return { head: r.ref.target.oid, boards, members: mt != null ? JSON.parse(mt) : {} };
}

// Um commit com os cartões que mudaram num quadro, os removidos, o BOARD.md dele e o BOARDS.md, sobre o commit que foi lido.
// Se alguém fez commit no meio, o GitHub recusa (expectedHeadOid) e quem chamou tenta de novo.
export async function save(token, repo, { head, boards, members = {} }, { slug, changed = [], removed = [], boardChanged = false, message, who }, branch = "main") {
  const errors = checkAll(boards, members);
  if (errors.length) throw new Error(errors.join("\n"));
  const b = boards.find((x) => x.slug === slug);
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const additions = [...changed.map((c) => ({ path: cardPath(slug, c.id), contents: b64(cardMd(c)) })), { path: boardMdPath(slug), contents: b64(boardMd(b.board, b.cards, slug, members)) }, { path: INDEX, contents: b64(boardsMd(boards)) }, ...(boardChanged ? [{ path: boardJsonPath(slug), contents: b64(JSON.stringify(b.board, null, 2) + "\n") }] : [])];
  const d = await graphql(token, `mutation($input:CreateCommitOnBranchInput!){ createCommitOnBranch(input:$input){ commit{ oid } } }`, {
    input: {
      branch: { repositoryNameWithOwner: repo, branchName: branch },
      message: { headline: who ? `${message} (@${who})` : message },
      expectedHeadOid: head,
      fileChanges: { additions, deletions: removed.map((c) => ({ path: cardPath(slug, c.id) })) },
    },
  });
  return d.createCommitOnBranch.commit.oid;
}

// Lê, aplica a mudança e grava; se o board andou no meio, lê de novo e reaplica (até 3 vezes).
export async function change(token, repo, apply, branch = "main") {
  for (let i = 0; ; i++) {
    const state = await load(token, repo, branch);
    const out = apply(state);
    if (!out) return state;   // nada mudou
    // O estado lido já está com a mudança (apply mexe nele): não precisa ler o GitHub de novo.
    try { await save(token, repo, state, out, branch); return state; }
    catch (e) { if (i >= 2 || !/expected|head|oid/i.test(e.message)) throw e; }
  }
}
