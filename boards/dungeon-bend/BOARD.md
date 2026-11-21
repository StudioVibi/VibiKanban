# Board · Dungeon Bend

> Gerado pelo `vk` a cada mudança. Não edite à mão: cada cartão é um arquivo em `boards/dungeon-bend/cards/`.

```mermaid
flowchart TD
  brainstorm["Brainstorm · 0"] --> refinamentos["Refinamentos · 2"]
  refinamentos --> backlog["Backlog · 26"]
  backlog --> doing["Fazendo · 5"]
  doing --> review["Revisão · 4"]
  review --> done["Feito · 11"]
  review -->|ajustes| doing
  doing:::blue
  review:::yellow
  done:::green
```

## Brainstorm · 0

_vazio_

## Refinamentos · 2

- **DB-46** bug visual: aviso de att pisca — @Ostrowskii
- **DB-47** qual booster estamos? — @Ostrowskii

## Backlog · 26

- **DB-5** Implementar sistema de logue e ganhe — @Ostrowskii @isabellaherman `ui` · 0/7 · espera DB-22
- **DB-24** DB lista de amigos — @Ostrowskii @isabellaherman
- **DB-28** Arte para o evento de fim de semana
- **DB-22** art do log e ganhe `Art`
- **DB-3** Sistema de composição de deck — @isabellaherman `Game design`
- **DB-7** 11 Arte dos items em composicao, cada item precisa de um asset especial. — @ilymeiib `Art` · espera DB-34
- **DB-4** Modo de jogo: evento — @isabellaherman @Leon-nis
- **DB-6** Definir tasks pro time de arte — @isabellaherman
- **DB-8** Quests — @Leon-nis `Game design` `ui`
- **DB-9** Publisher — @isabellaherman
- **DB-10** Endless Balance, pra jogadores que gostam de jogar o late game (nivel 15+) — @Leon-nis `Game design`
- **DB-11** Game Mode: Challenge. Modo de Jogo com Timer — @Leon-nis `Game design` `ui`
- **DB-16** Padronizar o patch note público — @isabellaherman
- **DB-17** Icone para o novo sistema de composição — @isabellaherman
- **DB-18** UX: Classes do sistema de combo — @isabellaherman `ui`
- **DB-19** Feedbacks: Sistema de combo e ativação do deck — @isabellaherman `ui`
- **DB-20** WARD WEAVER — @isabellaherman
- **DB-25** refinamento bend — @Ostrowskii
- **DB-34** Meeting de Briefing dos 11 items — @Leon-nis @ilymeiib `Game design`
- **DB-35** Meeting sobre gold e gold drop e seus incentivos. — @Leon-nis `Game design` · 1/1
  - ✓ **DB-53** remover "bad luck" do loot drop · Feito
- **DB-36** Meeting sobre ultimate e pontos por movimento. — @Leon-nis `Game design`
- **DB-38** Atualizacao do Ranking, 2 categorias com 3 topicos cada. Incluir arquivamento de ranking por temporada — @Leon-nis `Game design` `ui` · 1/1
  - ✓ **DB-54** Criar o criterio de fama `development` · 1/1 · Feito
    - ✓ **DB-55** testar a branch de fame-ranking `Testing` · Feito
- **DB-40** Meeting, progressao interna da run. Experiencia, Combos e Acumulos — @Leon-nis `Game design`
- **DB-41** Construcao do Patch notes geral, pra comunidade — @Leon-nis `Discord` · espera DB-16
- **DB-42** Revisar branchs do leon — @isabellaherman `Game design` · 2/2
  - ✓ **DB-43** mobs-v2 https://discord.com/channels/1466162797380505703/1468268698463768762/1573198989065461851 `Game design` · Feito
  - ✓ **DB-44** graveyard-piles https://discord.com/channels/1466162797380505703/1468268698463768762/1573126130947592212 — @isabellaherman `Game design` · Feito
- **DB-52** fix/intro-esc-deckbuilder-qol — @Leon-nis `bug`

## Fazendo · 5

- **DB-2** Dar continuidade no sistema de embaralhamento — @isabellaherman `Game design` `ui` · 0/2
- **DB-23** Multiplayer mode: weekend duels — @isabellaherman @Ostrowskii `development` `ui` · 4/10 · espera DB-28
- **DB-29** Dungeon Pocket — objetivos macro do port — @mete-marcha `Production` · 3/14 · IA
  - ✓ **DB-30** Mapeamento do DungeonBend para port 1:1 — @mete-marcha `Production` · 3/3 · Feito · IA
  - **DB-31** Decisões de base do port (viewports, referência, fontes, ouro, revisão) — @mete-marcha `Production` `Game design` · 4/6 · Fazendo · IA
  - **DB-32** Harness de referência web (Playwright) para o 1:1 — @mete-marcha `Testing` `development` · 4/5 · Revisão · IA
  - **DB-37** Criar projeto Unity 6000.4.5f1 mobile — @mete-marcha `development` · Revisão · IA
- **DB-48** Arte para os ícones de classes — @oootavio `Art`

## Revisão · 4

- **DB-12** Ajustes, Otimizacoes e Bugs — @Leon-nis `bug` · 1/1
  - ✓ **DB-33** PR feito · Feito
- **DB-39** Campo implicito: Fame, para monstros — @Leon-nis `development` · 1/1
  - ✓ **DB-45** Reuniao de apresentacao — @isabellaherman @Leon-nis `Game design` · Feito
_aninhadas no pai: **DB-32** (em DB-29), **DB-37** (em DB-29)_

## Feito · 11

- ✓ **DB-50** Testing: feat/mimic-loot-skip — @Leon-nis `Testing` `bug`
- ✓ **DB-51** Testing: Event mode na develop 2fafd909 (PR #127 + #128) — @Leon-nis @Ostrowskii `Testing`
- ✓ **DB-49** Correcao da Scene do drop loot para ficar de acordo com o mimic eliminado — @Leon-nis `bug`
_aninhadas no pai: **DB-55** (em DB-54), **DB-54** (em DB-38), **DB-53** (em DB-35), **DB-43** (em DB-42), **DB-44** (em DB-42), **DB-45** (em DB-39), **DB-33** (em DB-12), **DB-30** (em DB-29)_
