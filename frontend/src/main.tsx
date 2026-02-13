import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

if (!googleClientId) {
    console.warn("Missing VITE_GOOGLE_CLIENT_ID in .env file. Google Login will not work.");
}

createRoot(document.getElementById("root")!).render(
    <GoogleOAuthProvider clientId={googleClientId}>
        <App />
    </GoogleOAuthProvider>
);
