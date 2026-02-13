import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/store/auth";
import ProtectedRoute from "@/routes/ProtectedRoute";
import { AnimatePresence } from "framer-motion";
import PageTransition from "@/components/layout/PageTransition";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import UploadPage from "./pages/UploadPage";
import ProcessingPage from "./pages/ProcessingPage";
import ResultsPage from "./pages/ResultsPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import ComparePage from "./pages/ComparePage";
import SalaryExplorerPage from "./pages/SalaryExplorerPage";
import ForumListPage, { ForumPostPage } from "./pages/ForumPage";
import FeatureRequestsPage from "./pages/FeatureRequestsPage";

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
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Index /></PageTransition>} />
        <Route path="/upload" element={<PageTransition><UploadPage /></PageTransition>} />
        <Route path="/offers/:id/processing" element={<PageTransition><ProcessingPage /></PageTransition>} />
        <Route path="/offers/:id" element={<PageTransition><ResultsPage /></PageTransition>} />
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
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
