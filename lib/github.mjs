// O board no GitHub, para o site (work.studiovibi.com): lê e escreve os mesmos arquivos que o vk,
// direto no repositório, com o token de quem está logado. Cada mudança é um commit no nome dessa pessoa.
import { parseCard, cardMd, boardMd, check } from "./board.mjs";
import { cardPath } from "./paths.mjs";

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

// Tudo de uma vez: o commit de agora, board.json e os cartões.
export async function load(token, repo, branch = "main") {
  const [owner, name] = repo.split("/");
  const d = await graphql(token, `query($owner:String!,$name:String!,$ref:String!,$boardPath:String!,$cardsPath:String!){
    repository(owner:$owner,name:$name){
      ref(qualifiedName:$ref){ target{ oid } }
      board: object(expression:$boardPath){ ... on Blob { text } }
      cards: object(expression:$cardsPath){ ... on Tree { entries { name object { ... on Blob { text } } } } }
    }}`, { owner, name, ref: `refs/heads/${branch}`, boardPath: `${branch}:board/board.json`, cardsPath: `${branch}:board/cards` });
  const r = d.repository;
  if (!r?.ref || !r.board) throw new Error(`${repo} não tem board/board.json em ${branch}`);
  const cards = (r.cards?.entries ?? []).filter((e) => e.name.endsWith(".md") && e.object?.text != null).map((e) => parseCard(e.object.text));
  return { head: r.ref.target.oid, board: JSON.parse(r.board.text), cards };
}

// Um commit com os cartões que mudaram, os removidos e o BOARD.md, sobre o commit que foi lido.
// Se alguém fez commit no meio, o GitHub recusa (expectedHeadOid) e quem chamou tenta de novo.
export async function save(token, repo, { head, board, cards }, { changed = [], removed = [], message, who }, branch = "main") {
  const errors = check(board, cards);
  if (errors.length) throw new Error(errors.join("\n"));
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const additions = [...changed.map((c) => ({ path: cardPath(c.id), contents: b64(cardMd(c)) })), { path: "BOARD.md", contents: b64(boardMd(board, cards)) }];
  const d = await graphql(token, `mutation($input:CreateCommitOnBranchInput!){ createCommitOnBranch(input:$input){ commit{ oid } } }`, {
    input: {
      branch: { repositoryNameWithOwner: repo, branchName: branch },
      message: { headline: who ? `${message} (@${who})` : message },
      expectedHeadOid: head,
      fileChanges: { additions, deletions: removed.map((c) => ({ path: cardPath(c.id) })) },
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
    try { await save(token, repo, state, out, branch); return load(token, repo, branch); }
    catch (e) { if (i >= 2 || !/expected|head|oid/i.test(e.message)) throw e; }
  }
}
