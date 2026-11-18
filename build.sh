#!/bin/sh
set -e
cd "$(dirname "$0")"
bend bend-ui/BOARD_PROOF.bend
node bend-ui/board-check.js
node vk.mjs check
# O retrato dos quadros pro build (sem servidor). repo.board/cards: o VibiKanban, que o protótipo usa.
node -e 'const f=require("fs");const one=(s)=>({slug:s,board:f.readFileSync("boards/"+s+"/board.json","utf8"),cards:(f.existsSync("boards/"+s+"/cards")?f.readdirSync("boards/"+s+"/cards"):[]).filter(x=>x.endsWith(".md")).map(x=>f.readFileSync("boards/"+s+"/cards/"+x,"utf8"))});const boards=f.readdirSync("boards").filter(s=>f.existsSync("boards/"+s+"/board.json")).map(one);const vk=boards.find(b=>b.slug==="dungeon-bend")||boards[0];const members=f.existsSync("boards/members.json")?JSON.parse(f.readFileSync("boards/members.json","utf8")):{};f.writeFileSync("sources.js","export default "+JSON.stringify({board:f.readFileSync("bend-ui/BOARD.bend","utf8").trimEnd(),laws:f.readFileSync("bend-ui/BOARD_LAWS.bend","utf8").trimEnd(),check:f.readFileSync("bend-ui/board-check.js","utf8").trimEnd(),repo:{boards,members,board:vk.board,cards:vk.cards}})+";\n")'
# Uma página por pasta: o app (dist/, o que o vk serve abre) e o protótipo (dist-prototype/).
page() {
  rm -rf "$2" && bend "$1" -o "$2" >/dev/null
  ( cd "$2"
    perl -CSD -i -pe 's/\x{FFFD}/\\uFFFD/g' *.js
    printf '<title>%s</title>\n<link rel="stylesheet" href="./%s">\n<script type="module" src="./%s"></script>\n<main class="page" id="app"></main>\n' "$3" "$(ls *.css)" "$(ls *.js)" > page.html )
}
page index.html dist "VibiKanban"
cp -R avatars dist/   # as fotos dos membros IA (o campo avatar do boards/members.json)
page prototype.html dist-prototype "VibiKanban · protótipo"
echo "build: dist/ (app) e dist-prototype/ (protótipo)"
