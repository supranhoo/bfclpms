import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart3, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const { data: appSettings } = useAppSettings();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupFullName, setSignupFullName] = useState('');

  // Forgot password state
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [lastResetRequest, setLastResetRequest] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  const COOLDOWN_SECONDS = 60; // Rate limit: 1 request per 60 seconds

  // Cooldown timer effect
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setTimeout(() => {
        setCooldownRemaining(cooldownRemaining - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownRemaining]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await signIn(loginEmail, loginPassword);
    setIsSubmitting(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await signUp(signupEmail, signupPassword, signupFullName);
    if (!error) {
      // Auto-login after signup
      await signIn(signupEmail, signupPassword);
    }
    setIsSubmitting(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordError(null);

    // Check rate limiting
    const now = Date.now();
    const timeSinceLastRequest = (now - lastResetRequest) / 1000;
    if (lastResetRequest > 0 && timeSinceLastRequest < COOLDOWN_SECONDS) {
      const remaining = Math.ceil(COOLDOWN_SECONDS - timeSinceLastRequest);
      setCooldownRemaining(remaining);
      setForgotPasswordError(`Please wait ${remaining} seconds before requesting another reset.`);
      return;
    }

    setForgotPasswordLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setForgotPasswordError(error.message);
      } else {
        setForgotPasswordSuccess(true);
        setLastResetRequest(Date.now());
        setCooldownRemaining(COOLDOWN_SECONDS);
      }
    } catch (err) {
      setForgotPasswordError('An unexpected error occurred. Please try again.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const resetForgotPasswordDialog = () => {
    setForgotPasswordOpen(false);
    setForgotPasswordEmail('');
    setForgotPasswordSuccess(false);
    setForgotPasswordError(null);
  };

  // Dynamic background style
  const backgroundStyle = appSettings?.login_background_url
    ? {
        backgroundImage: `url(${appSettings.login_background_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {};

  const displayAppName = appSettings?.app_name || 'PMS Dashboard';

  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4"
      style={backgroundStyle}
    >
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          {appSettings?.logo_url ? (
            <img src={appSettings.logo_url} alt="Logo" className="h-10 w-10 object-contain" />
          ) : (
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <BarChart3 className="h-6 w-6" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">{displayAppName}</h1>
        </div>
        
        <Card className="border-border shadow-lg backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Welcome</CardTitle>
            <CardDescription>Sign in to access the Performance Management System</CardDescription>
          </CardHeader>
          
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setForgotPasswordOpen(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sign In
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Enter your full name"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Enter your email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Create a password (min 6 characters)"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      minLength={6}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Create Account
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotPasswordOpen} onOpenChange={(open) => {
        if (!open) resetForgotPasswordDialog();
        else setForgotPasswordOpen(true);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>

          {forgotPasswordSuccess ? (
            <div className="py-6">
              <div className="flex flex-col items-center text-center gap-4">
                <CheckCircle className="h-12 w-12 text-primary" />
                <div>
                  <p className="font-medium">Check your email</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We've sent a password reset link to <strong>{forgotPasswordEmail}</strong>
                  </p>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button onClick={resetForgotPasswordDialog} className="w-full">
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <div className="space-y-4 py-4">
                {forgotPasswordError && (
                  <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{forgotPasswordError}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="Enter your email"
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForgotPasswordDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={forgotPasswordLoading || cooldownRemaining > 0}>
                  {forgotPasswordLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : 'Send Reset Link'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
