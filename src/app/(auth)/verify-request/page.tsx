import { Suspense } from "react";
import VerifyRequestForm from "./_components/VerifyRequestForm";

export default function VerifyRequestPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading...</div>}>
      <VerifyRequestForm />
    </Suspense>
  );
}
