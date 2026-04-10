import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart3, Loader2, CheckCircle, AlertCircle, Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LoginSlideshow } from '@/components/auth/LoginSlideshow';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/utils';

export default function Auth() {
  const { user, loading, signIn } = useAuth();
  const { data: appSettings, isLoading: isLoadingSettings } = useAppSettings();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  

  // Focus state for input styling
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Forgot password state
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [lastResetRequest, setLastResetRequest] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [bgLoaded, setBgLoaded] = useState(false);

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

  const displayAppName = appSettings?.app_name || 'PMS Dashboard';
  const wallpapers = (appSettings?.login_wallpapers || []) as string[];

  // Defer mobile background image load for faster initial paint
  useEffect(() => {
    if (wallpapers.length > 0) {
      const img = new window.Image();
      img.onload = () => setBgLoaded(true);
      img.src = wallpapers[0];
    }
  }, [wallpapers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/home" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await signIn(loginEmail, loginPassword);
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


  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Side: Slideshow (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5">
        <LoginSlideshow
          wallpapers={wallpapers}
          interval={5000}
          organizationName={appSettings?.organization_name}
          appName={appSettings?.app_name}
          logoUrl={appSettings?.logo_url}
        />
      </div>

      {/* Right Side: Login Card */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
        {/* Theme Toggle - Top Right */}
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>

        {/* Mobile background - subtle gradient or single wallpaper */}
        <div className="absolute inset-0 lg:hidden">
          {wallpapers.length > 0 ? (
            <>
              {bgLoaded && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-20"
                  style={{ backgroundImage: `url(${wallpapers[0]})` }}
                />
              )}
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
          )}
        </div>

        <div className="w-full max-w-md z-10">
          {/* Mobile Logo */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            {appSettings?.logo_url ? (
              <img src={appSettings.logo_url} alt="Logo" className="h-10 w-10 object-contain rounded-lg" />
            ) : (
              <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                <BarChart3 className="h-6 w-6" />
              </div>
            )}
            <h1 className="text-2xl font-bold text-foreground">{displayAppName}</h1>
          </div>
          
          {/* Hero text above card */}
          <div className="text-center mb-6 hidden lg:block">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground leading-tight">
              {appSettings?.login_hero_headline || 'Manage performance with clarity.'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
              {appSettings?.login_hero_description || 'Track KPIs, conduct reviews, and drive organizational growth.'}
            </p>
          </div>
          
          {/* Glassmorphism Card */}
          <Card className="relative overflow-hidden border-border/50 shadow-2xl bg-card/80 backdrop-blur-xl">
            {/* Decorative gradient glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-secondary/20 rounded-full blur-3xl" />
            
            <CardHeader className="relative pb-2">
              <div className="flex items-center gap-3">
                {appSettings?.logo_url ? (
                  <img src={appSettings.logo_url} alt="Logo" className="h-10 w-10 object-contain rounded-lg" />
                ) : (
                  <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
                  <CardDescription className="text-left">
                    {displayAppName}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4 pt-4">
                {/* Email Field */}
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-medium">
                    Email Address
                  </Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className={cn(
                        "h-4 w-4 transition-colors",
                        focusedField === 'login-email' ? 'text-primary' : 'text-muted-foreground'
                      )} />
                    </div>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="name@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      onFocus={() => setFocusedField('login-email')}
                      onBlur={() => setFocusedField(null)}
                      className="pl-10 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20"
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => setForgotPasswordOpen(true)}
                      className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className={cn(
                        "h-4 w-4 transition-colors",
                        focusedField === 'login-password' ? 'text-primary' : 'text-muted-foreground'
                      )} />
                    </div>
                    <Input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onFocus={() => setFocusedField('login-password')}
                      onBlur={() => setFocusedField(null)}
                      className="pl-10 pr-10 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button
                  type="submit"
                  className="w-full h-11 font-semibold group"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>

            {/* Footer */}
            <div className="relative px-6 pb-4 pt-2 text-center">
              <p className="text-xs text-muted-foreground">
                Secure & Encrypted
              </p>
            </div>
          </Card>
        </div>
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
