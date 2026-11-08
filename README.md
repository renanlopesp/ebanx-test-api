# ebanx-test-api

Core mínimo de uma API com TypeScript, Fastify e Node.js 26. Bun é utilizado
para gerenciar dependências e executar scripts; o runtime da API e dos testes é Node.js.

## Requisitos

- Node.js 26.x
- Bun 1.4.3
- Docker com Compose (opcional para execução local)

## Desenvolvimento

```sh
bun install --frozen-lockfile
bun run dev
```

A API fica disponível em `http://localhost:3000`. O Node reinicia o processo
quando os arquivos são alterados. Não é necessário configurar um arquivo `.env`.

| Variável | Padrão    | Descrição                |
| -------- | --------- | ------------------------ |
| `HOST`   | `0.0.0.0` | Interface de escuta      |
| `PORT`   | `3000`    | Porta HTTP, de 1 a 65535 |

## Endpoints

```sh
curl http://localhost:3000/health
```

Resposta HTTP `200`:

```json
{ "status": "ok" }
```

| Método | Rota                      | Resposta de sucesso          |
| ------ | ------------------------- | ---------------------------- |
| `POST` | `/reset`                  | `200 OK` (texto puro)        |
| `GET`  | `/balance?account_id=100` | `200` com o saldo numérico   |
| `POST` | `/event`                  | `201` com as contas afetadas |

Exemplos de eventos:

```sh
curl -X POST http://localhost:3000/reset
curl -X POST http://localhost:3000/event \
  -H 'Content-Type: application/json' \
  -d '{"type":"deposit","destination":"100","amount":10}'
curl 'http://localhost:3000/balance?account_id=100'
curl -X POST http://localhost:3000/event \
  -H 'Content-Type: application/json' \
  -d '{"type":"withdraw","origin":"100","amount":5}'
curl -X POST http://localhost:3000/event \
  -H 'Content-Type: application/json' \
  -d '{"type":"transfer","origin":"100","destination":"300","amount":5}'
```

### Regras

- IDs são strings não vazias; zeros à esquerda são preservados.
- `amount` deve ser um inteiro positivo seguro (`Number.isSafeInteger`). Não há conversão de strings numéricas.
- Depósito cria a conta de destino. Saque exige uma origem existente.
- Transferência exige origem existente e cria o destino quando necessário.
- Saldo insuficiente retorna `409`; entrada inválida, transferência para a própria conta ou saldo resultante fora do limite seguro retornam `400`.
- Conta inexistente retorna `404` com corpo `0`, tanto em consultas quanto em eventos válidos que exigem uma origem.
- Falhas não alteram saldos nem criam contas; uma transferência é validada por inteiro antes das alterações, sem operações assíncronas entre elas.
- Contas com saldo zero continuam existindo. Consultas não alteram o estado.
- Campos adicionais são ignorados. Erros de negócio `400`/`409` retornam `{ "message": "..." }`.

## Scripts

```sh
bun run typecheck    # Verificação de tipos
bun run lint         # ESLint
bun run lint:fix     # Correções automáticas de lint
bun run format      # Formatação com Prettier
bun run format:check
bun run test         # Todos os testes com node:test
bun run test:unit
bun run test:integration # Integração HTTP via fastify.inject
bun run build        # Compilação para dist/
bun run start        # Execução do build com Node.js
bun run check        # Tipos, lint, formatação, testes e build
```

Os testes unitários exercitam diretamente `AccountService`, sem mocks: depósitos,
saques, transferências para destinos novos e existentes, conservação do saldo
total nas transferências e falhas sem efeitos parciais.

Os testes de integração cobrem a sequência completa de validação, reset,
isolamento entre aplicações, entradas inválidas, saldo insuficiente, limites
numéricos e leituras repetidas de contas existentes sem alterar o saldo.
Usam `fastify.inject`, sem abrir portas.
E2E automatizado via HTTP real e testes de carga ficam para uma próxima etapa.

## Formatação automática no commit

Husky executa o lint-staged no hook `pre-commit`:

- ESLint com `--fix` e Prettier nos arquivos JS/TS preparados para commit.
- Prettier nos demais formatos suportados, respeitando `.prettierignore`.
- Erros de lint não corrigíveis bloqueiam o commit.

Os arquivos corrigidos são incluídos automaticamente no commit. Arquivos fora do
staging não são formatados; alterações não preparadas nos mesmos arquivos são
preservadas pelo lint-staged.

Em um clone Git, `bun install` ativa os hooks pelo script `prepare`. Se você
instalou as dependências antes de inicializar o repositório, execute, quando
for preparar seu primeiro commit:

```sh
git init
bun run prepare
```

A instalação também funciona sem `.git`. Em Docker os hooks são desativados com
`HUSKY=0`; não é necessário ter Git na imagem.

## Docker

```sh
docker compose up --build -d
curl http://localhost:3000/health
docker compose logs -f api
docker compose down
```

A imagem usa build multi-stage, contém apenas dependências de produção na etapa
final, roda como usuário não root e inclui healthcheck. O Compose publica a porta 3000. Não há banco de dados nem volumes persistentes.

## Estrutura

```text
src/
  app.ts                  # Criação da aplicação e registro das rotas
  accounts.ts             # Regras de contas e armazenamento em Map
  routes.ts               # Validação de entrada e respostas HTTP
  server.ts               # Inicialização HTTP e encerramento por sinais
test/
  integration/
    accounts.test.ts
    health.test.ts
  unit/
    accounts.test.ts
```

A criação da aplicação é separada da abertura da porta para facilitar os testes.
Não há camada MVC ou repositório enquanto não existirem funcionalidades que
precisem dessas abstrações.

## Estado em memória

As contas ficam exclusivamente em um `Map` na memória de cada aplicação: serão
perdidas a cada reinício, inclusive no modo watch, ou ao chamar `/reset`.
Não são compartilhadas entre instâncias. Não há garantia de durabilidade após
o encerramento do processo.
