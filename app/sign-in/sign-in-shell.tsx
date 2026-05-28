"use client";

/**
 * Sign-in shell — Magic Link + Google OAuth.
 *
 * When cloud sync isn't configured (env vars absent), shows a clear
 * "single-device mode" notice instead of broken inputs. When configured,
 * the same surface offers passwordless email and Google OAuth.
 *
 * Why magic link instead of password: passwords are a support burden
 * (resets, leaks, browser-saved drift) and the sign-in flow we need
 * here is "remember me across devices on this account", not "secure
 * a high-value vault". Magic link is the lowest-friction match.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/cloud/auth";
import { getBrowserClient, isCloudConfigured } from "@/lib/cloud/supabase";

export function SignInShell() {
  const cloudOn = isCloudConfigured();
  const { user, status, signOut } = useAuth();
  const router = useRouter();

  if (!cloudOn) return <DisabledState />;
  if (status === "signed-in" && user) {
    return <SignedInState email={user.email ?? "(no email)"} signOut={signOut} />;
  }

  return <SignInForm onSignedIn={() => router.push("/library")} />;
}

// ─────────────────────────── Variants ────────────────────────────────

function DisabledState() {
  return (
    <div className="flex flex-col gap-5">
      <span className="plate inline-flex self-start">§ SIGN IN · DISABLED</span>
      <h1
        className="font-serif text-ink"
        style={{
          fontSize: "clamp(36px, 4.5vw, 56px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        Cloud sync isn&rsquo;t configured <em>on this server.</em>
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-dim">
        Lumen runs in single-device mode by default — your Library and
        Studio projects live in this browser&rsquo;s storage and never
        leave. To enable cross-device sync, the operator needs to set{" "}
        <code className="rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[12px]">
          NEXT_PUBLIC_SUPABASE_URL
        </code>{" "}
        and{" "}
        <code className="rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[12px]">
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </code>{" "}
        in the environment.
      </p>
      <Link
        href="/library"
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim hover:text-ink"
      >
        ← Back to Library
      </Link>
    </div>
  );
}

function SignedInState({
  email,
  signOut,
}: {
  email: string;
  signOut: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <span className="plate inline-flex self-start">§ SIGN IN · ACTIVE</span>
      <h1
        className="font-serif text-ink"
        style={{
          fontSize: "clamp(36px, 4.5vw, 56px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        Signed in as <em>{email}</em>.
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-dim">
        Your Library and Studio projects sync across every device you sign
        in on. Sign out below to drop back to single-device mode on this
        browser.
      </p>
      <div className="flex gap-3">
        <Button asChild variant="primary">
          <Link href="/library">Go to Library →</Link>
        </Button>
        <Button onClick={() => void signOut()} variant="secondary">
          Sign out
        </Button>
      </div>
    </div>
  );
}

function SignInForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPhase("sending");
    setError(null);
    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Cloud client unavailable");
      setPhase("error");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // After clicking the magic link, Supabase redirects here. We
        // just bounce back to /library which mounts AuthProvider; the
        // auth-state-change listener does the rest.
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/library`
            : undefined,
      },
    });
    if (error) {
      setError(error.message);
      setPhase("error");
      return;
    }
    setPhase("sent");
  }

  async function signInWithGoogle() {
    const supabase = getBrowserClient();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/library`
            : undefined,
      },
    });
    // Supabase handles the redirect; on return AuthProvider fires the
    // change listener and we land on Library via onSignedIn.
    onSignedIn();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="plate inline-flex self-start">§ SIGN IN</span>
        <h1
          className="font-serif text-ink"
          style={{
            fontSize: "clamp(36px, 4.5vw, 56px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          Sync your work <em>across devices.</em>
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-dim">
          Sign in to mirror your Library and Studio projects to the cloud.
          Single-device use stays local — no account required.
        </p>
      </div>

      {/* Magic link */}
      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={phase === "sending" || phase === "sent"}
            className="h-11 w-full rounded-[10px] border border-border bg-panel px-3.5 text-[14px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={phase === "sending" || phase === "sent" || !email.trim()}
        >
          {phase === "sending"
            ? "Sending…"
            : phase === "sent"
              ? "Check your email ✓"
              : "Send magic link →"}
        </Button>
      </form>

      {phase === "sent" && (
        <p className="rounded-[10px] border border-accent/40 bg-accent-soft px-4 py-3 text-[13px] text-ink">
          We sent a sign-in link to <strong>{email}</strong>. Click it from
          this device — it&rsquo;ll bring you back signed in.
        </p>
      )}
      {error && (
        <p className="rounded-[10px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button onClick={signInWithGoogle} variant="secondary" size="lg">
        Continue with Google
      </Button>

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
        By signing in you agree to keep your prompts to yourself —
        we don&rsquo;t train on user data.
      </p>
    </div>
  );
}
