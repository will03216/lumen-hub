import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Sign up — Lumen Hub",
  description: "Create an account to sync your Library and Studio projects across devices.",
};

export default function SignUpPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[640px] px-4 py-16 md:px-7 md:py-24 flex justify-center">
        <SignUp />
      </main>
    </>
  );
}
