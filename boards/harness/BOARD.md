# Board · Harness

> Gerado pelo `vk` a cada mudança. Não edite à mão: cada cartão é um arquivo em `boards/harness/cards/`.

```mermaid
flowchart TD
  backlog["Backlog · 1"] --> doing["Fazendo · 0"]
  doing --> review["Revisão · 0"]
  review --> done["Feito · 0"]
  review -->|ajustes| doing
  doing:::blue
  review:::yellow
  done:::green
```

## Backlog · 1

- **HN-1** preciso encontrar porntos de melhoria — @Ostrowskii `ui`

## Fazendo · 0

_vazio_

## Revisão · 0

_vazio_

## Feito · 0

_vazio_
