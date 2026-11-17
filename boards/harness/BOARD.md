# Board · Harness

> Gerado pelo `vk` a cada mudança. Não edite à mão: cada cartão é um arquivo em `boards/harness/cards/`.

```mermaid
flowchart TD
  backlog["Backlog · 0"] --> doing["Fazendo · 2"]
  doing --> review["Revisão · 1"]
  review --> done["Feito · 1"]
  review -->|ajustes| doing
  doing:::blue
  review:::yellow
  done:::green
```

## Backlog · 0

_vazio_

## Fazendo · 2

- **HN-1** preciso encontrar pontos de melhoria — @Ostrowskii `ui`
- **HN-2** Ongoing iteration: estabilizando a v1 do harness — @isabellaherman `bend`

## Revisão · 1

- **HN-4** ai meu deus né — @isabellaherman

## Feito · 1

- **HN-3** ssss — @isabellaherman
