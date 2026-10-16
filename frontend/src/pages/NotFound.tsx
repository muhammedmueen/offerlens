import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="bg-graph flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-cyan-700">// 404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">We couldn't find that page.</h1>
        <p className="mb-6 mt-2 text-base text-stone-700">The link may be broken, or the page may have moved.</p>
        <a href="/" className="font-medium text-cyan-700 underline underline-offset-4 hover:text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2">
          Back to home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
