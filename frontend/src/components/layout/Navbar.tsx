import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Upload, MessageSquare, TrendingUp, Lightbulb, LayoutDashboard, LogOut, User, Menu, X, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const navLinks = [
    { to: "/upload", label: "Upload", icon: Upload },
    { to: "/forum", label: "Forum", icon: MessageSquare },
    { to: "/salaries", label: "Salaries", icon: TrendingUp },
    { to: "/feature-requests", label: "Requests", icon: Lightbulb },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 skeu-nav backdrop-blur-md">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold skeu-btn">
            OL
          </div>
          <span className="hidden sm:inline">OfferLens</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-accent hover:shadow-sm cursor-pointer"
            >
              <l.icon className="h-4 w-4" />
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="cursor-pointer rounded-lg">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-accent hover:shadow-sm cursor-pointer"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="cursor-pointer rounded-lg">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="skeu-card rounded-xl">
                  <DropdownMenuItem className="text-muted-foreground text-xs" disabled>
                    {user?.email}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate("/login")} className="cursor-pointer text-sm rounded-lg">
                Log in
              </Button>
              <Button onClick={() => navigate("/signup")} className="cursor-pointer brand-gradient text-primary-foreground hover:opacity-90 text-sm rounded-lg skeu-btn">
                Sign up
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Button variant="ghost" size="icon" className="md:hidden cursor-pointer" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 pb-4 pt-2 space-y-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
            >
              <l.icon className="h-4 w-4" />
              {l.label}
            </Link>
          ))}
          <button onClick={() => setDark(!dark)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          <div className="border-t border-border pt-2 mt-2 space-y-1">
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <button onClick={() => { handleLogout(); setMobileOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer">
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer">
                  Log in
                </Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary cursor-pointer">
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
