# OfferLens Backend

AI-powered offer letter analysis API.

## Tech Stack

- **Runtime**: Node.js 22.13+, TypeScript
- **Framework**: Fastify 5
- **Database**: PostgreSQL via Drizzle ORM
- **Queue / cache**: Redis + BullMQ (background workers)
- **AI providers**: Gemini (default) / OpenAI / Anthropic
- **OCR providers**: Azure AI Document Intelligence / Google Cloud Vision
- **Validation**: Zod
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 22.13+
- npm
- Docker (for local Postgres + Redis via the included `docker-compose.yml`)

### Installation

1.  Navigate to the project directory:
    ```bash
    cd backend
    ```

2.  Copy the environment template and fill in the required values (at minimum `JWT_SECRET` and `JWT_REFRESH_SECRET`):
    ```bash
    cp .env.example .env
    ```

3.  Start Postgres and Redis:
    ```bash
    docker compose up -d
    ```

4.  Install dependencies:
    ```bash
    npm install
    ```

5.  Run database migrations:
    ```bash
    npm run db:migrate
    ```

6.  Start the API server:
    ```bash
    npm run dev
    ```

7.  In a separate terminal, start the background workers (required for offer analysis to complete):
    ```bash
    npm run workers
    ```

The API will be available at `http://localhost:8000`. `CORS_ORIGIN` must match the frontend's origin (default `http://localhost:8080`).

### Other scripts

| Command | Purpose |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` / `npm run start:workers` | Run compiled server / workers |
| `npm test` | Run the Vitest suite |
| `npm run db:seed` | Seed reference data |
| `npm run lint` | Type-check + ESLint |

For API reference, deployment, and current project status, see the root [`README.md`](../README.md) and [`docs/`](../docs).
