# Credentials Guide for OfferLens

This guide details how to obtain and configure all the necessary credentials for the OfferLens application (Backend & Frontend).

## Overview

| Service | Environment Variable | Required In | Description |
| :--- | :--- | :--- | :--- |
| **Google Cloud** | `GOOGLE_CLIENT_ID` | Backend & Frontend | OAuth 2.0 Client ID for Google Login |
| **Google Cloud** | `GOOGLE_CLIENT_SECRET` | Backend | OAuth 2.0 Client Secret (optional for implicit flow verification but recommended) |
| **Google Cloud** | `GOOGLE_CLOUD_CREDENTIALS` | Backend | Service Account Key for Cloud Vision API (OCR) |
| **Google AI** | `GEMINI_API_KEY` | Backend | API Key for Gemini Pro (Analysis) |
| **PostgreSQL** | `DATABASE_URL` | Backend | Connection string for the database |
| **Redis** | `REDIS_URL` | Backend | Connection string for Redis (queues/cache) |
| **JWT** | `JWT_SECRET` | Backend | Secret key for signing Access Tokens |
| **JWT** | `JWT_REFRESH_SECRET` | Backend | Secret key for signing Refresh Tokens |

---

## 1. Google OAuth 2.0 (Login)

You need a Google Cloud Project to enable "Sign in with Google".

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project or select an existing one.
3.  Navigate to **APIs & Services > OAuth consent screen**.
    *   Select **External** (for testing) or **Internal** (if you have an organization).
    *   Fill in the App Name ("OfferLens"), Support Email, and Developer Contact Info.
    *   Click **Save and Continue**.
4.  Navigate to **Credentials**.
5.  Click **Create Credentials > OAuth client ID**.
6.  Select **Web application**.
7.  **Name**: "OfferLens Web".
8.  **Authorized JavaScript origins**:
    *   `http://localhost:8080` (Frontend)
    *   `http://localhost:8000` (Backend - optional but good practice)
9.  **Authorized redirect URIs**:
    *   `http://localhost:8080`
    *   `http://localhost:8080/auth/callback` (if using redirect flow)
10. Click **Create**.
11. Copy the **Client ID** and **Client Secret**.

### Configuration
*   **Frontend (`frontend/.env`)**:
    ```bash
    VITE_GOOGLE_CLIENT_ID=your-client-id
    ```
*   **Backend (`backend/.env`)**:
    ```bash
    GOOGLE_CLIENT_ID=your-client-id
    GOOGLE_CLIENT_SECRET=your-client-secret
    ```

---

## 2. Google Cloud Vision API (OCR)

This is used to extract text from uploaded offer letters (PDF/Images).

1.  In the same Google Cloud Project, search for **Cloud Vision API**.
2.  Click **Enable**.
3.  Navigate to **IAM & Admin > Service Accounts**.
4.  Click **Create Service Account**.
    *   **Name**: "offerlens-vision".
    *   **Role**: **Cloud Vision API User**.
5.  Click **Done**.
6.  Click on the newly created service account e-mail.
7.  Go to the **Keys** tab.
8.  Click **Add Key > Create new key**.
9.  Select **JSON**.
10. A JSON file will automatically download.
11. Rename this file (e.g., `service-account.json`) and place it in `backend/keys/`.

### Configuration
*   **Backend (`backend/.env`)**:
    ```bash
    GOOGLE_CLOUD_CREDENTIALS=./keys/service-account.json
    ```

---

## 3. Google Gemini API (Analysis)

This is used for the AI analysis of offer details.

1.  Go to [Google AI Studio](https://aistudio.google.com/).
2.  Click **Get API key**.
3.  Click **Create API key in new project**.
4.  Copy the generated API Key.

### Configuration
*   **Backend (`backend/.env`)**:
    ```bash
    GEMINI_API_KEY=your-gemini-api-key
    ```

---

## 4. Database (PostgreSQL) & Redis

For local development, ensure you have PostgreSQL and Redis installed and running.

### PostgreSQL
*   **Default URL**: `postgres://postgres:postgres@localhost:5432/offerlens`
*   If using Docker: `docker run --name offerlens-db -e POSTGRES_PASSWORD=postgres -d -p 5432:5432 postgres`

### Redis
*   **Default URL**: `redis://127.0.0.1:6379`
*   If using Docker: `docker run --name offerlens-redis -d -p 6379:6379 redis`

---

## 5. JWT Secrets

You need random strings to sign your authentication tokens.

1.  Open a terminal (or Node.js REPL).
2.  Run the following command twice (once for each secret):
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
3.  Copy the outputs.

### Configuration
*   **Backend (`backend/.env`)**:
    ```bash
    JWT_SECRET=first-generated-string
    JWT_REFRESH_SECRET=second-generated-string
    ```

---

## Final Checklist

Ensure all files are saved and servers are restarted after updating `.env` files.

*   [ ] `backend/keys/service-account.json` exists.
*   [ ] `backend/.env` is fully populated.
*   [ ] `frontend/.env` has `VITE_GOOGLE_CLIENT_ID` and `VITE_API_BASE_URL`.
