import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/store/auth";
import ProtectedRoute from "@/routes/ProtectedRoute";
import { AnimatePresence } from "framer-motion";
import PageTransition from "@/components/layout/PageTransition";

import { lazy, Suspense } from "react";
import LoadingState from "@/components/common/LoadingState";
import ErrorBoundary from "@/components/common/ErrorBoundary";

// The landing page is eagerly imported — it is the most common entry point, so lazy
// loading it would only add a round trip.
import Index from "./pages/Index";

/**
 * Every other route is code-split (ADR-002).
 *
 * The build was a single 1,465 KB chunk against a 200 KB initial budget. Splitting per
 * route also pulls `recharts` out of the critical path: it is only used by ScoreGauge,
 * SalaryBar and BenefitsPie, which live on Results, Compare and Salary Explorer.
 *
 * `framer-motion` is deliberately NOT split — PageTransition wraps every route, so it is
 * genuinely in the critical path and deferring it would just delay first paint.
 */
const NotFound = lazy(() => import("./pages/NotFound"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const ProcessingPage = lazy(() => import("./pages/ProcessingPage"));
const ResultsPage = lazy(() => import("./pages/ResultsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const SalaryExplorerPage = lazy(() => import("./pages/SalaryExplorerPage"));
const FeatureRequestsPage = lazy(() => import("./pages/FeatureRequestsPage"));
// ForumPage exports the list as default and the detail view as a named export.
const ForumListPage = lazy(() => import("./pages/ForumPage"));
const ForumPostPage = lazy(() =>
  import("./pages/ForumPage").then((m) => ({ default: m.ForumPostPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    // No `mode="wait"`: waiting for the outgoing page's exit fade to finish before mounting
    // the incoming one forced a blank gap — and because routes are lazy, that gap landed on
    // the Suspense fallback, reading as a refresh/flicker. Letting the two fades overlap
    // (crossfade) removes the gap. The `grid` wrapper gives both in/out pages one shared cell
    // (each page carries `col-start-1 row-start-1`) so they overlap instead of stacking
    // vertically, which would jump the page height mid-fade.
    <div className="grid">
    <AnimatePresence>
      {/* One boundary around the route tree, keyed on pathname so navigating away from a
          crashed page clears the error. Without this, any render throw inside a page
          unmounted the entire app to a blank document. */}
      <ErrorBoundary key={location.pathname} title="This page failed to load.">
      <Suspense
        fallback={
          <div className="container mx-auto max-w-4xl px-4 py-12 col-start-1 row-start-1">
            <LoadingState rows={4} />
          </div>
        }
      >
      <Routes location={location} key={location.pathname}>
        {/* Core examination flow advances with the `forward` rise (Moment 6); every other
            route keeps the default `fade`. */}
        <Route path="/" element={<PageTransition><Index /></PageTransition>} />
        <Route path="/upload" element={<PageTransition kind="forward"><UploadPage /></PageTransition>} />
        <Route path="/offers/:id/processing" element={<PageTransition kind="forward"><ProcessingPage /></PageTransition>} />
        <Route path="/offers/:id" element={<PageTransition kind="forward"><ResultsPage /></PageTransition>} />
        <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
        <Route path="/signup" element={<PageTransition><SignupPage /></PageTransition>} />
        <Route path="/dashboard" element={<ProtectedRoute><PageTransition><DashboardPage /></PageTransition></ProtectedRoute>} />
        <Route path="/compare" element={<ProtectedRoute><PageTransition><ComparePage /></PageTransition></ProtectedRoute>} />
        <Route path="/salaries" element={<PageTransition><SalaryExplorerPage /></PageTransition>} />
        <Route path="/forum" element={<PageTransition><ForumListPage /></PageTransition>} />
        <Route path="/forum/:id" element={<PageTransition><ForumPostPage /></PageTransition>} />
        <Route path="/feature-requests" element={<PageTransition><FeatureRequestsPage /></PageTransition>} />
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </AnimatePresence>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* Opt into the two v7 behaviours react-router 6.30 warns about on every boot.
            Both are the v7 defaults, so adopting them now keeps the upgrade a version bump:
            - v7_startTransition: route state updates go through React.startTransition
            - v7_relativeSplatPath: relative links inside the `*` route resolve from the
              matched path rather than the splat value */}
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AnimatedRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
