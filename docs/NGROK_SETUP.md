# Local Development with Ngrok

This guide explains how to expose the OfferLens backend to the internet using **ngrok**, allowing you to connect a frontend running on a different device or external server.

## 1. Prerequisites

- **Ngrok** installed ([Download here](https://ngrok.com/download))
- Backend running locally on port `8000`

## 2. Start Ngrok

Run the following command in a new terminal window:

```bash
ngrok http 8000
```

You will see output similar to this:

```
Forwarding                    https://<random-id>.ngrok-free.app -> http://localhost:8000
```

Copy the HTTPS URL (e.g., `https://a1b2c3d4.ngrok-free.app`).

## 3. Update Backend Configuration

To allow your frontend to communicate with the backend via ngrok, you need to update the CORS settings.

1.  Open `.env` in the `backend` directory.
2.  Update `CORS_ORIGIN` to match your frontend's URL.

### Scenarios:

**A. Frontend running locally (localhost:3000)**
This is the default. If you access the backend via ngrok from your local machine, the Origin is still `localhost:3000`.
```env
CORS_ORIGIN=http://localhost:3000
```

**B. Frontend running on another device/network (e.g., mobile)**
If you are accessing the frontend from a different device, the frontend must also be hosted somewhere accessible (e.g., on Vercel, or another ngrok tunnel).
- If frontend is at `https://my-app.vercel.app`:
  ```env
  CORS_ORIGIN=https://my-app.vercel.app
  ```
- If frontend is also on ngrok (`https://frontend-xyz.ngrok-free.app`):
  ```env
  CORS_ORIGIN=https://frontend-xyz.ngrok-free.app
  ```

**C. Development Mode (Allow All)**
For temporary testing (not recommended for production), allow all origins:
*Note: This might fail if the backend enforces credentials (cookies).*
```env
CORS_ORIGIN=*
```

## 4. Update Frontend Configuration

Point your frontend to the ngrok URL.

1.  Open your frontend's environment file (e.g., `.env.local`).
2.  Update the API URL variable:

```env
NEXT_PUBLIC_API_URL=https://<random-id>.ngrok-free.app
```

## 5. Swagger UI

You can access the API documentation via the ngrok URL:
`https://<random-id>.ngrok-free.app/documentation`
