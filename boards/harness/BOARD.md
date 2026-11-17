# Board · Harness

> Gerado pelo `vk` a cada mudança. Não edite à mão: cada cartão é um arquivo em `boards/harness/cards/`.

```mermaid
flowchart TD
  backlog["Backlog · 2"] --> doing["Fazendo · 3"]
  doing --> review["Revisão · 0"]
  review --> done["Feito · 0"]
  review -->|ajustes| doing
  doing:::blue
  review:::yellow
  done:::green
```

## Backlog · 2

- **HN-4** Corrigir o problema de multiplos chats — @isabellaherman
- **HN-5** botão open project in a new tab — @Ostrowskii

## Fazendo · 3

- **HN-2** Ongoing iteration: estabilizando a v1 do harness — @isabellaherman `bend`
- **HN-1** preciso encontrar pontos de melhoria — @Ostrowskii `ui`
- **HN-3** Terminal: como implementar um terminal dentro do harness — @isabellaherman `infra`

## Revisão · 0

_vazio_

## Feito · 0

_vazio_
