import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Phone, CheckCircle2, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type EmailFormValues = z.infer<typeof emailSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

const ForgotPassword = () => {
  const navigate = useNavigate();
  // Flow state
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const pwForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onEmailSubmit = async (data: EmailFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email);
      if (error) throw error;
      
      setEmail(data.email);
      setStep("otp");
      toast.success("Reset code sent!", {
        description: "Please check your email for the 6-digit recovery code.",
      });
    } catch (error: any) {
      toast.error("Failed to send code", {
        description: error.message || "Something went wrong. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Invalid Code", { description: "Please enter the full 6-digit code." });
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "recovery",
      });

      if (error) throw error;

      setStep("password");
      toast.success("Code verified!", {
        description: "You can now securely choose a new password.",
      });
    } catch (error: any) {
      toast.error("Verification failed", {
        description: error.message || "Invalid or expired code. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) throw error;
      
      toast.success("Password updated successfully!", {
        description: "You can now log in with your new password.",
      });
      // Optionally sign out the user if you want them to log back in
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error: any) {
      toast.error("Update failed", {
        description: error.message || "Could not update password. Please try again.",
      });
    } finally {
      setIsLoading(false);
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

            {step === "email" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Reset your password</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Enter the email address associated with your account and we'll send you a recovery code.
                </p>
              </div>
            )}

            {step === "otp" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Check your email</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  We sent a 6-digit recovery code to <span className="font-semibold text-foreground">{email}</span>.
                </p>
              </div>
            )}

            {step === "password" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <KeyRound className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Set new password</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Choose a new password for your account to securely log back in.
                </p>
              </div>
            )}
          </div>

          <div className="mt-8">
            {step === "email" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-5">
                    <FormField
                      control={emailForm.control}
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

                    <Button type="submit" className="w-full h-12 text-base font-semibold mt-6 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200" disabled={isLoading}>
                      {isLoading ? "Sending code..." : "Send recovery code"}
                    </Button>
                  </form>
                </Form>
                
                <p className="mt-8 text-center text-sm text-muted-foreground">
                  Remember your password?{" "}
                  <Link to="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
                    Back to login
                  </Link>
                </p>
              </div>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <InputOTP 
                    maxLength={8} 
                    value={otp}
                    onChange={setOtp}
                  >
                    <InputOTPGroup className="gap-2">
                      <InputOTPSlot index={0} className="w-10 h-12 text-lg rounded-md border" />
                      <InputOTPSlot index={1} className="w-10 h-12 text-lg rounded-md border" />
                      <InputOTPSlot index={2} className="w-10 h-12 text-lg rounded-md border" />
                      <InputOTPSlot index={3} className="w-10 h-12 text-lg rounded-md border" />
                      <InputOTPSlot index={4} className="w-10 h-12 text-lg rounded-md border" />
                      <InputOTPSlot index={5} className="w-10 h-12 text-lg rounded-md border" />
                      <InputOTPSlot index={6} className="w-10 h-12 text-lg rounded-md border" />
                      <InputOTPSlot index={7} className="w-10 h-12 text-lg rounded-md border" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <div className="space-y-4">
                  <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200" disabled={isLoading || otp.length !== 6}>
                    {isLoading ? "Verifying..." : "Verify Code"}
                  </Button>
                  
                  <p className="text-center text-sm text-muted-foreground">
                    Didn't receive the code?{" "}
                    <button type="button" onClick={() => setStep("email")} className="font-medium text-primary hover:text-primary/80 underline-offset-4 hover:underline transition-all" disabled={isLoading}>
                      Try again
                    </button>
                  </p>
                </div>
              </form>
            )}

            {step === "password" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <Form {...pwForm}>
                  <form onSubmit={pwForm.handleSubmit(onPasswordSubmit)} className="space-y-5">
                    <FormField
                      control={pwForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">New Password</FormLabel>
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
                      control={pwForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">Confirm New Password</FormLabel>
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
                      {isLoading ? "Updating..." : "Reset Password"}
                    </Button>
                  </form>
                </Form>
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
                Secure Password Recovery
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Get back access to your Callecto account quickly and securely. Your operations data is protected with enterprise-grade security.
              </p>
            </div>
            
            <div className="space-y-6 pt-4">
              {[
                { title: "Enterprise Grade Security", desc: "Multi-factor authentication and bank-level encryption." },
                { title: "Fast Recovery", desc: "Get back to monitoring your intelligent debt collection without missing a beat." },
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
