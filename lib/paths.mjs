// Onde cada coisa mora no repositório: um quadro por pasta em boards/<quadro>/.
export const boardDir = (slug) => `boards/${slug}`;
export const boardJsonPath = (slug) => `boards/${slug}/board.json`;
export const cardPath = (slug, id) => `boards/${slug}/cards/${id}.md`;
export const boardMdPath = (slug) => `boards/${slug}/BOARD.md`;
export const INDEX = "BOARDS.md";   // a porta de entrada: todos os quadros numa página
export const MEMBERS = "boards/members.json";   // os membros IA (só eles); opcional
