# Board · Dungeon Bend

> Gerado pelo `vk` a cada mudança. Não edite à mão: cada cartão é um arquivo em `boards/dungeon-bend/cards/`.

```mermaid
flowchart TD
  brainstorm["Brainstorm · 0"] --> refinamentos["Refinamentos · 0"]
  refinamentos --> backlog["Backlog · 24"]
  backlog --> doing["Fazendo · 4"]
  doing --> review["Revisão · 3"]
  review --> done["Feito · 2"]
  review -->|ajustes| doing
  doing:::blue
  review:::yellow
  done:::green
```

## Brainstorm · 0

_vazio_

## Refinamentos · 0

_vazio_

## Backlog · 24

- **DB-5** Implementar sistema de logue e ganhe — @Ostrowskii @isabellaherman `ui` · 0/7 · espera DB-22
- **DB-24** DB lista de amigos — @Ostrowskii @isabellaherman
- **DB-28** Arte para o evento de fim de semana
- **DB-22** art do log e ganhe
- **DB-3** Sistema de composição de deck — @isabellaherman `Game design`
- **DB-7** 11 Arte dos items em composicao, cada item precisa de um asset especial. — @ilymeiib `Art` · espera DB-34
- **DB-4** Modo de jogo: evento — @isabellaherman
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
- **DB-34** Meeting de Briefing dos 11 items — @Leon-nis `Game design`
- **DB-35** Meeting sobre gold e gold drop e seus incentivos. — @Leon-nis `Game design`
- **DB-36** Meeting sobre ultimate e pontos por movimento. — @Leon-nis `Game design`
- **DB-38** Atualizacao do Ranking, 2 categorias com 3 topicos cada. Incluir arquivamento de ranking por temporada — @Leon-nis `Game design` `ui`
- **DB-39** Campo implicito: Fame, para monstros — @Leon-nis `development`
- **DB-40** Meeting, progressao interna da run. Experiencia, Combos e Acumulos — @Leon-nis `Game design`

## Fazendo · 4

- **DB-2** Dar continuidade no sistema de embaralhamento — @isabellaherman `Game design` `ui`
- **DB-23** Multiplayer mode: weekend duels — @isabellaherman @Ostrowskii `development` `ui` · 4/10 · espera DB-28
- **DB-29** Dungeon Pocket — objetivos macro do port — @mete-marcha `Production` · 3/14 · IA
  - ✓ **DB-30** Mapeamento do DungeonBend para port 1:1 — @mete-marcha `Production` · 3/3 · Feito · IA
  - **DB-31** Decisões de base do port (viewports, referência, fontes, ouro, revisão) — @mete-marcha `Production` `Game design` · 4/6 · Fazendo · IA
  - **DB-32** Harness de referência web (Playwright) para o 1:1 — @mete-marcha `Testing` `development` · 4/5 · Revisão · IA
  - **DB-37** Criar projeto Unity 6000.4.5f1 mobile — @mete-marcha `development` · Revisão · IA

## Revisão · 3

- **DB-12** Ajustes, Otimizacoes e Bugs — @Leon-nis `bug` · 1/1
  - ✓ **DB-33** PR feito · Feito
_aninhadas no pai: **DB-32** (em DB-29), **DB-37** (em DB-29)_

## Feito · 2

_aninhadas no pai: **DB-33** (em DB-12), **DB-30** (em DB-29)_
