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
    // Suspense and the error boundary wrap AnimatePresence ONCE and persist across
    // navigations — they are deliberately NOT keyed on pathname. That is the whole fix for
    // the double flicker:
    //
    //   Before, Suspense sat *inside* a pathname-keyed subtree, so it remounted on every
    //   navigation. A fresh Suspense boundary has no committed content, so React is forced
    //   to show its fallback (the skeleton) the instant the lazy route chunk suspends —
    //   flicker 1 (home → skeleton), then flicker 2 (skeleton → faded-in page).
    //
    //   With react-router's v7_startTransition on, navigation runs inside a React
    //   transition. A *persistent* Suspense boundary that has already committed content lets
    //   a transition keep the previous page on screen while the new chunk loads, instead of
    //   dropping to the fallback. So the old page simply holds, then the new page fades in
    //   once — no skeleton flash. The fallback now only appears on the very first paint,
    //   before any route has committed, which is correct.
    //
    // The one-cell grid stacks the outgoing and incoming page in the same cell (each
    // PageTransition sits at col-start-1 row-start-1). AnimatePresence keeps the old page
    // mounted for its 0.3s exit fade; without the grid the new page would render BELOW it
    // and jump up when the exit finishes. `grid-cols-1` is minmax(0,1fr), so wide page
    // content can still shrink instead of overflowing on mobile.
    <ErrorBoundary title="This page failed to load." resetKey={location.pathname}>
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl px-4 py-12">
          <LoadingState rows={4} />
        </div>
      }
    >
    <div className="grid grid-cols-1">
    <AnimatePresence>
      <Routes location={location} key={location.pathname}>
        {/* Every route uses the same plain opacity fade (lib/motion pageVariants); the
            `kind` prop is kept only for a possible future distinction. */}
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
    </AnimatePresence>
    </div>
    </Suspense>
    </ErrorBoundary>
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
