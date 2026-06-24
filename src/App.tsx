import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import Landing from "./pages/Landing";
import TestDashboard from "./pages/test-Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

// Admin and Dhipaya still use the Supabase client, which throws at import time
// when the Supabase env vars are absent. Lazy-load them so the main (Go-auth)
// app boots without Supabase configured; they only load when those routes open.
const Admin = lazy(() => import("./pages/Admin"));
const Dhipaya = lazy(() => import("./pages/Dhipaya"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AdminProvider>
        <WorkspaceProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/auth/callback" element={<OAuthCallback />} />
                {/* /dashboard and /test render the same (current) dashboard surface */}
                <Route path="/dashboard" element={<TestDashboard />} />
                <Route path="/test" element={<TestDashboard />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/dhipaya" element={<Dhipaya />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </WorkspaceProvider>
      </AdminProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
