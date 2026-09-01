import type { Metadata } from "next";
import { Suspense } from "react";
import { createMetadata } from "@/lib/metadata";
import VerifyRequestForm from "./_components/VerifyRequestForm";

export const metadata: Metadata = createMetadata({
  title: "Verify email",
  description: "Enter the verification code sent to your email.",
  path: "/verify-request",
  noIndex: true,
});

export default function VerifyRequestPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading...</div>}>
      <VerifyRequestForm />
    </Suspense>
  );
}
