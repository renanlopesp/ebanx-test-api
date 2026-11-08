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

## Endpoint

```sh
curl http://localhost:3000/health
```

Resposta HTTP `200`:

```json
{ "status": "ok" }
```

## Scripts

```sh
bun run typecheck    # Verificação de tipos
bun run lint         # ESLint
bun run lint:fix     # Correções automáticas de lint
bun run format      # Formatação com Prettier
bun run format:check
bun run test         # Testes de integração com node:test e fastify.inject
bun run build        # Compilação para dist/
bun run start        # Execução do build com Node.js
bun run check        # Tipos, lint, formatação, testes e build
```

Os testes atuais verificam o `/health` e o retorno 404 para rotas desconhecidas,
sem abrir portas. Testes unitários serão adicionados junto às regras de negócio.
E2E via HTTP real e testes de carga ficam para uma próxima etapa; ainda não estão
implementados neste core.

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
  server.ts               # Inicialização HTTP e encerramento por sinais
test/
  integration/
    health.test.ts
```

A criação da aplicação é separada da abertura da porta para facilitar os testes.
Não há camada MVC ou repositório enquanto não existirem funcionalidades que
precisem dessas abstrações.

## Estado em memória

O core não armazena dados de negócio. Quando houver funcionalidades com estado,
os dados ficarão exclusivamente na memória do processo: serão perdidos a cada
reinício, inclusive no modo watch, e não serão compartilhados entre instâncias.
Não há garantia de durabilidade após o encerramento do processo.
