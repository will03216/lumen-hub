import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SignInShell } from "./sign-in-shell";

export const metadata: Metadata = {
  title: "Sign in — Lumen Hub",
  description:
    "Sign in to sync your Library and Studio projects across devices. Single-device use stays local — no account needed.",
};

export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[640px] px-4 py-16 md:px-7 md:py-24">
        <SignInShell />
      </main>
    </>
  );
}
