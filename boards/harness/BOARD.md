# Board · Harness

> Gerado pelo `vk` a cada mudança. Não edite à mão: cada cartão é um arquivo em `boards/harness/cards/`.

```mermaid
flowchart TD
  backlog["Backlog · 5"] --> doing["Fazendo · 3"]
  doing --> review["Revisão · 0"]
  review --> done["Feito · 0"]
  review -->|ajustes| doing
  doing:::blue
  review:::yellow
  done:::green
```

## Backlog · 5

- **HN-4** Corrigir o problema de multiplos chats — @isabellaherman
- **HN-5** botão open project in a new tab — @isabellaherman `ui` `bend`
- **HN-6** aumentar contraste de cor ou sensação de divisória da lib bend-ui — @isabellaherman `ui`
- **HN-7** melhorar fluxo de visualizar e manejar laws — @Ostrowskii
- **HN-8** Finalizar* a v1 do harness e mandar pra nico — @isabellaherman

## Fazendo · 3

- **HN-2** Ongoing iteration: estabilizando a v1 do harness — @isabellaherman `bend`
- **HN-3** Terminal: como implementar um terminal dentro do harness — @isabellaherman `infra`
- **HN-1** preciso encontrar pontos de melhoria — @Ostrowskii `ui`

## Revisão · 0

_vazio_

## Feito · 0

_vazio_
