import { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageShell from "@/components/layout/PageShell";
import { Loader2 } from "lucide-react";

const LoginPage = () => {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        await loginWithGoogle(tokenResponse.access_token);
        navigate(returnUrl, { replace: true });
      } catch (err) {
        setError("Google login failed.");
        setLoading(false);
      }
    },
    onError: () => {
      setError("Google login failed.");
      setLoading(false);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      navigate(returnUrl, { replace: true });
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 rounded-2xl p-8 skeu-card">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Log in to your OfferLens account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className="rounded-lg" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Log in
            </Button>
          </form>

          <Button variant="outline" className="w-full cursor-pointer rounded-xl skeu-emboss" onClick={() => googleLogin()}>
            Login with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary hover:underline cursor-pointer">Sign up</Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
};

export default LoginPage;
