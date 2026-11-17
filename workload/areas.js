// As áreas do estúdio. A skill de um cartão é a tag dele; cada quadro diz de que áreas é cada tag (board.json: tags).
// color é o número da cor no WORKLOAD.bend (1 é o roxo da Creative); icon é um ícone da Bend-UI; tool é a ferramenta da formiga.
export default [
  { id: "creative", name: "Creative", color: 1, icon: "wand-sparkles", tool: "brush" },
  { id: "development", name: "Development", color: 2, icon: "code", tool: "wrench" },
  { id: "management", name: "Management", color: 3, icon: "circle-check", tool: "clipboard" },
  { id: "community", name: "Community", color: 4, icon: "user", tool: "megaphone" },
  { id: "business", name: "Business", color: 5, icon: "chart-column", tool: "briefcase" },
];
