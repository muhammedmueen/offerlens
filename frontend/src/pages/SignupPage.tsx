import { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageShell from "@/components/layout/PageShell";
import { Loader2 } from "lucide-react";
import { RATE_LIMITED_AUTH_TEXT, isRateLimited } from "@/lib/quota";

const SignupPage = () => {
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        await loginWithGoogle(tokenResponse.access_token);
        navigate("/dashboard", { replace: true });
      } catch (err) {
        setError(isRateLimited(err) ? RATE_LIMITED_AUTH_TEXT : "Google signup failed.");
        setLoading(false);
      }
    },
    onError: () => {
      setError("Google signup failed.");
      setLoading(false);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signup(email, password, name || undefined);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(isRateLimited(err) ? RATE_LIMITED_AUTH_TEXT : "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">Free forever. No credit card required.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={8} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full cursor-pointer rounded-md">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign up free
            </Button>
          </form>

          {/* Hidden when VITE_GOOGLE_CLIENT_ID is blank, as frontend/.env.example promises. */}
          {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <Button variant="outline" className="w-full cursor-pointer" onClick={() => googleLogin()}>
              Sign up with Google
            </Button>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline cursor-pointer">Log in</Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
};

export default SignupPage;
