"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export default function VerifyRequestForm() {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [otpPending, startOtpTransition] = useTransition();
  const params = useSearchParams();
  const email = params.get("email") as string;
  const isOtpCompleted = otp.length === 6;

  function verifyOtp() {
    startOtpTransition(async () => {
      await authClient.signIn.emailOtp({
        email: email,
        otp: otp,
        fetchOptions: {
          onSuccess: async () => {
            toast.success("Email verified");
            // Route by link state so a fresh email user goes straight to the
            // connect screen instead of bouncing /repos -> /connect-github.
            // The dashboard layout still gates on a linked account, so direct
            // navigation while unlinked is caught regardless.
            const session = await authClient.getSession();
            router.push(
              session.data?.user?.githubUsername ? "/repos" : "/connect-github",
            );
          },
          onError: () => {
            toast.error("Error verifying Email/OTP");
          },
        },
      });
    });
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-xl mb-1">Please check your email</CardTitle>
        <CardDescription>
          We have sent a verification code to{" "}
          <span className="font-medium">{email}</span>. Please enter the 6-digit
          code below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <InputOTP
            value={otp}
            onChange={(value) => setOtp(value)}
            maxLength={6}
            className="gap-3"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <p className="text-sm text-muted-foreground mt-2">
            Enter the 6-digit code sent to your email
          </p>
        </div>
        <Button
          onClick={verifyOtp}
          disabled={otpPending || !isOtpCompleted}
          className="w-full mt-2"
        >
          {otpPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              <span>Verifying...</span>
            </>
          ) : (
            "Verify & Continue"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
