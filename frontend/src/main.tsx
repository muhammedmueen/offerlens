import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
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
