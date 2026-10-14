# OfferLens

OfferLens is an AI-powered offer analysis tool that helps you evaluate your job offers, compare salaries, identify red flags, and get negotiation tips in seconds.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Fastify

## Getting Started

### Prerequisites

- Node.js 22.13+ (the repo targets one version for both packages; the backend requires it, Vite 5 alone would run on 18 or 20+)
- npm

### Installation

1.  Navigate to the project directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

The application will be available at `http://localhost:8080`.

### Backend Connection

Ensure the backend server is running on port `8000`. The frontend does not proxy: the browser calls `http://localhost:8000/api/v1` directly (override with `VITE_API_BASE_URL`), so the backend's `CORS_ORIGIN` must match this app's origin. For production builds and hosting, see `docs/DEPLOYMENT.md`.
