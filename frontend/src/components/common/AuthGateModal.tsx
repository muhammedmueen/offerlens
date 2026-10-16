import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/store/auth";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";

interface AuthGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
}

const AuthGateModal: React.FC<AuthGateModalProps> = ({ open, onOpenChange, featureName }) => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signup(email, password);
      onOpenChange(false);
    } catch {
      setError("Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Create a Free Account</DialogTitle>
          <DialogDescription className="text-center">
            Sign up to unlock {featureName}, save your analyses, and more.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gate-email">Email</Label>
            <Input id="gate-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gate-password">Password</Label>
            <Input id="gate-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={8} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full cursor-pointer rounded-md">
            {loading ? "Creating account…" : "Sign up free"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button onClick={() => { onOpenChange(false); navigate("/login"); }} className="text-primary hover:underline cursor-pointer">
            Log in
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default AuthGateModal;
