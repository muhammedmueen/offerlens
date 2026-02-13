# OfferLens

OfferLens is an AI-powered offer analysis tool that helps you evaluate your job offers, compare salaries, identify red flags, and get negotiation tips in seconds.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express

## Getting Started

### Prerequisites

- Node.js (v18+)
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

Ensure the backend server is running on port `8000`. The frontend is configured to proxy requests to `http://localhost:8000/api/v1`.
