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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const GITHUB_USERNAME_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export default function VerifyRequestForm() {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [step, setStep] = useState<"otp" | "username">("otp");
  const [otpPending, startOtpTransition] = useTransition();
  const [usernamePending, startUsernameTransition] = useTransition();
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

            try {
              const session = await authClient.getSession();

              if (session?.data?.user?.name) {
                toast.success("Welcome back!");
                router.push("/");
              } else {
                setStep("username");
              }
            } catch {
              setStep("username");
            }
          },
          onError: () => {
            toast.error("Error verifying Email/OTP");
          },
        },
      });
    });
  }

  function updateGithubUsername() {
    const trimmed = username.trim();

    if (!trimmed) {
      toast.error("Please enter your GitHub username");
      return;
    }

    if (!GITHUB_USERNAME_REGEX.test(trimmed)) {
      toast.error("Please enter a valid GitHub username");
      return;
    }

    startUsernameTransition(async () => {
      await authClient.updateUser({
        name: trimmed,
        fetchOptions: {
          onSuccess: () => {
            toast.success("Profile completed successfully!");
            router.push("/");
          },
          onError: () => {
            toast.error("Error updating profile");
          },
        },
      });
    });
  }

  if (step === "username") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl mb-1">Complete your profile</CardTitle>
          <CardDescription>
            Enter your GitHub username so we can review your repositories.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">GitHub Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="octocat"
              required
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim()) {
                  updateGithubUsername();
                }
              }}
            />
          </div>
          <Button
            onClick={updateGithubUsername}
            disabled={usernamePending || !username.trim()}
            className="w-full"
          >
            {usernamePending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                <span>Saving...</span>
              </>
            ) : (
              "Complete Setup"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center space-y-2">
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
