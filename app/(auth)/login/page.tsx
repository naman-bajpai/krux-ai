"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, Chrome, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setFormError("Invalid email or password");
      } else if (result?.url) {
        router.push(result.url);
        router.refresh();
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setIsGoogleLoading(true);
    await signIn("google", { callbackUrl });
  }

  const errorMessage =
    error === "OAuthSignin"
      ? "Error signing in with Google"
      : error === "CredentialsSignin"
      ? "Invalid credentials"
      : error
      ? "An error occurred"
      : formError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-white">AI Migrator</span>
        </div>

        <Card className="border-slate-700/50 bg-slate-900/80 backdrop-blur-sm shadow-2xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-white text-xl">Welcome back</CardTitle>
            <CardDescription className="text-slate-400">
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error message */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            {/* Google OAuth */}
            <Button
              variant="outline"
              className="w-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isLoading}
            >
              {isGoogleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Chrome className="h-4 w-4" />
              )}
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <Separator className="flex-1 bg-slate-700" />
              <span className="text-xs text-slate-500">or</span>
              <Separator className="flex-1 bg-slate-700" />
            </div>

            {/* Credentials Form */}
            <form onSubmit={handleCredentialsLogin} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-300 text-xs">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={isLoading}
                  className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-300 text-xs">
                    Password
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                  className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              <Button
                type="submit"
                className="w-full mt-1"
                disabled={isLoading || isGoogleLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-xs text-slate-500">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="text-blue-400 hover:text-blue-300"
              >
                Get started
              </Link>
            </p>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-slate-600 mt-6">
          © {new Date().getFullYear()} AI Migrator. All rights reserved.
        </p>
      </div>
    </div>
  );
}
