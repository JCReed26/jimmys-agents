"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GeistMono } from "geist/font/mono";

export default function VerifyPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      router.push("/login");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          Enter the 6-digit code sent to{" "}
          <span className="text-foreground font-medium">{email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">One-time code</Label>
            <Input
              ref={inputRef}
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`text-center text-2xl tracking-[0.5em] ${GeistMono.className}`}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? "Verifying…" : "Verify"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => router.push("/login")}
          >
            Back
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
