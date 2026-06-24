import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BotnoiGroupFooter } from "@/test/BotnoiGroupFooter";
import { Phone, BarChart3, Users, Zap, Shield, Clock, LayoutDashboard } from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Already signed in? Skip the marketing page.
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleSignIn = () => navigate("/login");

  const features = [
    {
      icon: Phone,
      title: "Automated Calling",
      description: "AI-powered voice calls that handle debt collection conversations naturally"
    },
    {
      icon: Users,
      title: "Debtor Management",
      description: "Comprehensive CDP to track and manage all your debtor interactions"
    },
    {
      icon: BarChart3,
      title: "Real-time Analytics",
      description: "Monitor call performance, outcomes, and conversion rates instantly"
    },
    {
      icon: Zap,
      title: "Auto-Dial Loops",
      description: "Batch process calls automatically with intelligent pacing"
    },
    {
      icon: Shield,
      title: "Secure & Compliant",
      description: "Enterprise-grade security with full audit trails"
    },
    {
      icon: Clock,
      title: "24/7 Operations",
      description: "Schedule calls around the clock without manual intervention"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />

        <header className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Phone className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Callecto</span>
          </Link>

          {isAuthenticated ? (
            <Button onClick={() => navigate("/dashboard")} size="sm">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          ) : (
            <Button onClick={handleSignIn} variant="outline" size="sm">
              Sign In
            </Button>
          )}
        </header>

        <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
              Intelligent Debt Collection
              <span className="block text-primary mt-2">Automation Platform</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
              Streamline your debt recovery with AI-powered voice calls, real-time analytics,
              and comprehensive debtor management. Increase recovery rates while reducing operational costs.
            </p>

            <Button
              onClick={handleSignIn}
              size="lg"
              className="h-14 px-8 text-base gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </Button>
          </div>
        </main>
      </div>

      {/* Features Section */}
      <section className="py-24 px-6 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Everything you need for efficient collection
          </h2>
          <p className="text-muted-foreground text-center mb-16 max-w-2xl mx-auto">
            A complete platform designed to maximize recovery rates and minimize manual effort
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/20 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to transform your collections?</h2>
          <p className="text-muted-foreground mb-8">
            Join leading financial institutions using Callecto to automate debt recovery
          </p>
          <Button
            onClick={handleGoogleLogin}
            size="lg"
            className="h-14 px-8 text-base gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Get Started with Google
          </Button>
        </div>
      </section>

      <BotnoiGroupFooter />
    </div>
  );
};

export default Landing;
