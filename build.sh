#!/bin/sh
set -e
cd "$(dirname "$0")"
bend bend-ui/BOARD_PROOF.bend
node bend-ui/board-check.js
node vk.mjs check
node -e 'const f=require("fs");f.writeFileSync("sources.js","export default "+JSON.stringify({board:f.readFileSync("bend-ui/BOARD.bend","utf8").trimEnd(),laws:f.readFileSync("bend-ui/BOARD_LAWS.bend","utf8").trimEnd(),check:f.readFileSync("bend-ui/board-check.js","utf8").trimEnd(),repo:{board:f.readFileSync("board/board.json","utf8"),cards:f.readdirSync("board/cards").filter(x=>x.endsWith(".md")).map(x=>f.readFileSync("board/cards/"+x,"utf8"))}})+";\n")'
# Uma página por pasta: o app (dist/, o que o vk serve abre) e o protótipo (dist-prototype/).
page() {
  rm -rf "$2" && bend "$1" -o "$2" >/dev/null
  ( cd "$2"
    perl -CSD -i -pe 's/\x{FFFD}/\\uFFFD/g' *.js
    printf '<title>%s</title>\n<link rel="stylesheet" href="./%s">\n<script type="module" src="./%s"></script>\n<main class="page" id="app"></main>\n' "$3" "$(ls *.css)" "$(ls *.js)" > page.html )
}
page index.html dist "VibiKanban"
page prototype.html dist-prototype "VibiKanban · protótipo"
echo "build: dist/ (app) e dist-prototype/ (protótipo)"
