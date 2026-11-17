// As áreas do estúdio. A skill de um cartão é a tag dele; cada quadro diz de que áreas é cada tag (board.json: tag_areas).
// color é o número da cor no WORKLOAD.bend (1 é o roxo da Criativa); icon é um ícone da Bend-UI; tool é a ferramenta da formiga.
export default [
  { id: "criativa", name: "Criativa", color: 1, icon: "wand-sparkles", tool: "brush" },
  { id: "dev", name: "Desenvolvimento", color: 2, icon: "code", tool: "wrench" },
  { id: "gestao", name: "Gestão", color: 3, icon: "circle-check", tool: "clipboard" },
  { id: "comunidade", name: "Comunidade", color: 4, icon: "user", tool: "megaphone" },
  { id: "negocios", name: "Negócios", color: 5, icon: "chart-column", tool: "briefcase" },
];
