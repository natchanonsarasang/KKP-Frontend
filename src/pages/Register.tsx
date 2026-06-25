import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { getGoogleIdToken, getMicrosoftIdToken } from "@/test/api/oauth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Phone, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";

const registerSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const Register = () => {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle, signInWithMicrosoft } = useAuth();
  // The "otp" step is retained for layout compatibility, but the Go API has no
  // email-verification step, so registration logs the user straight in.
  const [step, setStep] = useState<"register" | "otp">("register");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [otp, setOtp] = useState("");

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    try {
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      await signUp(data.email, data.password, fullName);

      // The Go register endpoint returns a session token, so the user is now
      // signed in — no email confirmation step.
      toast.success("Registration successful!", {
        description: "Welcome to Callecto.",
      });
      navigate("/dashboard");
    } catch (error: any) {
      toast.error("Registration failed", {
        description: error.message || "Something went wrong. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    // No email-verification step in the Go API; kept only so the unused OTP
    // layout below still has a handler. Sends the user to the dashboard.
    e.preventDefault();
    setIsVerifying(true);
    navigate("/dashboard");
    setIsVerifying(false);
  };

  const handleGoogleSignup = async () => {
    try {
      const idToken = await getGoogleIdToken();
      await signInWithGoogle(idToken);
      navigate("/dashboard");
    } catch (error: any) {
      toast.error("Google signup failed", {
        description: error.message || "Could not sign up with Google.",
      });
    }
  };

  const handleMicrosoftSignup = async () => {
    try {
      const idToken = await getMicrosoftIdToken();
      await signInWithMicrosoft(idToken);
      navigate("/dashboard");
    } catch (error: any) {
      toast.error("Microsoft signup failed", {
        description: error.message || "Could not sign up with Microsoft.",
      });
    }
  };

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-accent/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Main Container */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 relative z-10 w-full lg:w-1/2 mt-12 lg:mt-0 xl:w-[45%]">
        <div className="mx-auto w-full max-w-sm lg:w-[420px]">
          
          <div className="mb-8">
            <Link to="/" className="flex items-center gap-3 w-fit hover:opacity-80 transition-opacity mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Phone className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-foreground">Callecto</span>
            </Link>

            {step === "otp" ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Check your email</h2>
                <p className="text-muted-foreground mt-2">
                  We sent a 8-digit verification code to
                  <span className="block font-medium text-foreground mt-1">{registeredEmail}</span>. Enter the code to verify your account.
                </p>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Create an account</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Already have an account?{" "}
                  <button onClick={() => navigate("/login")} className="font-semibold text-primary hover:text-primary/80 transition-colors">
                    Sign in instead
                  </button>
                </p>
              </div>
            )}
          </div>

          <div className="mt-8">
            {step === "otp" ? (
              <form onSubmit={handleVerifyOtp} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <InputOTP 
                    maxLength={6} 
                    value={otp}
                    onChange={setOtp}
                  >
                    <InputOTPGroup className="gap-2">
                      <InputOTPSlot index={0} className="w-12 h-14 text-lg rounded-md border" />
                      <InputOTPSlot index={1} className="w-12 h-14 text-lg rounded-md border" />
                      <InputOTPSlot index={2} className="w-12 h-14 text-lg rounded-md border" />
                      <InputOTPSlot index={3} className="w-12 h-14 text-lg rounded-md border" />
                      <InputOTPSlot index={4} className="w-12 h-14 text-lg rounded-md border" />
                      <InputOTPSlot index={5} className="w-12 h-14 text-lg rounded-md border" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <div className="space-y-4">
                  <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200" disabled={isVerifying || otp.length !== 6}>
                    {isVerifying ? "Verifying..." : "Verify Email"}
                  </Button>
                  
                  <p className="text-center text-sm text-muted-foreground">
                    Didn't receive the code?{" "}
                    <button type="button" onClick={() => setStep("register")} className="font-medium text-primary hover:text-primary/80 underline-offset-4 hover:underline transition-all">
                      Try another email
                    </button>
                  </p>
                </div>
              </form>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="space-y-6 flex flex-col items-center">
                  <Button 
                    type="button"
                    variant="outline" 
                    className="w-full h-12 relative bg-white/60 dark:bg-background/60 backdrop-blur-md border-border/60 hover:bg-white/90 dark:hover:bg-background/90 hover:shadow-sm font-medium transition-all duration-200"
                    onClick={handleGoogleSignup}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 relative bg-white/60 dark:bg-background/60 backdrop-blur-md border-border/60 hover:bg-white/90 dark:hover:bg-background/90 hover:shadow-sm font-medium transition-all duration-200"
                    onClick={handleMicrosoftSignup}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 23 23">
                      <path fill="#f25022" d="M1 1h10v10H1z" />
                      <path fill="#7fba00" d="M12 1h10v10H12z" />
                      <path fill="#00a4ef" d="M1 12h10v10H1z" />
                      <path fill="#ffb900" d="M12 12h10v10H12z" />
                    </svg>
                    Continue with Microsoft
                  </Button>
                </div>

                <div className="mt-8 relative">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground bg-background rounded-full border border-border/40 py-1">
                      Or continue with email
                    </span>
                  </div>
                </div>

                <div className="mt-8">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/80 font-medium">First Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="John" 
                                  className="h-12 bg-white/50 dark:bg-background/50 backdrop-blur-sm border-border/60 focus:ring-primary/20 transition-all shadow-sm" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/80 font-medium">Last Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Doe" 
                                  className="h-12 bg-white/50 dark:bg-background/50 backdrop-blur-sm border-border/60 focus:ring-primary/20 transition-all shadow-sm" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Email address</FormLabel>
                            <FormControl>
                              <Input 
                                type="email" 
                                placeholder="john@example.com" 
                                className="h-12 bg-white/50 dark:bg-background/50 backdrop-blur-sm border-border/60 focus:ring-primary/20 transition-all shadow-sm" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                placeholder="••••••••" 
                                className="h-12 bg-white/50 dark:bg-background/50 backdrop-blur-sm border-border/60 focus:ring-primary/20 transition-all shadow-sm" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Confirm Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                placeholder="••••••••" 
                                className="h-12 bg-white/50 dark:bg-background/50 backdrop-blur-sm border-border/60 focus:ring-primary/20 transition-all shadow-sm" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" className="w-full h-12 text-base font-semibold mt-6 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200" disabled={isLoading}>
                        {isLoading ? "Creating account..." : "Create account"}
                      </Button>
                    </form>
                  </Form>
                </div>
                
                <p className="mt-8 text-center text-xs text-muted-foreground/80 leading-relaxed max-w-[90%] mx-auto">
                  By registering, you agree to our{" "}
                  <a href="#" className="font-medium text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Terms of Service</a>
                  {" "}and{" "}
                  <a href="#" className="font-medium text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Privacy Policy</a>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decorative Right Panel (visible on large screens) */}
      <div className="hidden lg:block relative w-1/2 xl:w-[55%] bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden border-l border-border/30 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="absolute inset-0 bg-[#f8fafc] dark:bg-black opacity-30 mix-blend-multiply" />
        <div className="absolute inset-0 flex items-center justify-center p-12 lg:p-16 xl:p-24 relative z-10">
          <div className="max-w-lg space-y-10 bg-white/40 dark:bg-black/20 p-10 rounded-3xl backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-xl">
            <div className="space-y-4">
              <h3 className="text-3xl xl:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">
                Intelligent Debt Collection Automation
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Streamline your debt recovery with AI-powered voice calls, real-time analytics, and comprehensive debtor management. Increase recovery rates naturally.
              </p>
            </div>
            
            <div className="space-y-6 pt-4">
              {[
                { title: "AI-Powered Voice Engine", desc: "Natural conversations that handle objections smoothly." },
                { title: "Increase Recovery Rates", desc: "Automated dialing strategies that maximize contact rates." },
                { title: "Compliance First", desc: "Enterprise-grade security built into every interaction." }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl hover:bg-white/40 dark:hover:bg-white/5 transition-colors duration-200 border border-transparent hover:border-white/30">
                  <div className="mt-1 bg-white dark:bg-background rounded-full p-1.5 shadow-sm">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{item.title}</h4>
                    <p className="text-sm text-foreground/70 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="pt-8 border-t border-border/40 mt-8">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-12 h-12 rounded-full border-[3px] border-background bg-gradient-to-br from-primary/30 to-accent/30 shadow-sm" />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <svg key={i} className="w-4 h-4 text-amber-500 fill-amber-500" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground/80">Joined by 500+ professionals</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
