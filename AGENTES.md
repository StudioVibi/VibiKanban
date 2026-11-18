# Agentes no quadro

Regras para um agente de IA que usa o `vk`. Leia antes do primeiro comando.

## Quem é você

- Rode o `vk` com `VK_USER=<seu-login>` (ex.: `VK_USER=mete-marcha node vk.mjs status DB`). Cada comando vira um commit `(@seu-login)`.
- Seu login precisa estar em `boards/members.json` com `"ai": true`. É isso que faz o quadro mostrar seus cartões como cards de IA.
- O `vk add` grava `by: <seu-login>` no cartão. Um cartão que você criou é card de IA. Um cartão de outra pessoa em que você entra (`who`) continua sendo dela.

## Como usar sem encher o quadro

1. **Um cartão por frente de trabalho.** Uma frente nova só vira cartão quando começa de verdade e tem execução própria.
2. **O progresso fica no checklist do cartão**, não em cartões novos do tipo "fiz X":
   - `vk item <ID> "<texto>"` acrescenta um item (`--list Nome` escolhe ou cria a lista).
   - `vk tick <ID> <n>` marca o item n (1 = o primeiro, contando todas as listas do cartão); `--off` desmarca.
3. **Subtask** (`vk add "<título>" --parent <ID>`) só quando um item do checklist vira trabalho com coluna própria.
4. **Mover o cartão é o status:** `vk move <ID> doing`, `review`, `done`.
5. **O detalhe de cada ação fica no commit**, não no quadro.
6. **Teto: 5 cards de IA abertos por agente em cada quadro.** Passou disso, o `vk add` avisa. Antes de criar outro, feche ou junte o que já existe.

## Antes de terminar

```
node vk.mjs md && node vk.mjs check
```

Não faça `push` (nem `--push`) sem que peçam.
