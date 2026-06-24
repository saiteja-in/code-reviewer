import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { sendVerificationEmail } from "@/lib/resend";
import { GITHUB_OAUTH_SCOPES } from "@/lib/auth-shared";
import { db } from "../db";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      // The GitHub login (e.g. "octocat"). Sourced from the verified GitHub
      // profile — never user-typed. `input: false` blocks client writes
      // (e.g. updateUser); the server populates it via mapProfileToUser /
      // updateUserInfoOnLink.
      githubUsername: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: GITHUB_OAUTH_SCOPES,
      // Set the display name from the GitHub full name (falling back to the
      // login only when empty/null), and capture the login separately as
      // `githubUsername`. Applied on first GitHub sign-up and — together with
      // `updateUserInfoOnLink` below — when an existing email user links GitHub.
      mapProfileToUser: (profile) => ({
        name: profile.name || profile.login,
        githubUsername: profile.login,
        image: profile.avatar_url,
      }),
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      // Copy the GitHub profile (name, image, githubUsername) onto an existing
      // email-OTP user the moment they link GitHub. Email/emailVerified are
      // left untouched, so linking can't rebind account identity.
      updateUserInfoOnLink: true,
      allowDifferentEmails: true,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL!],
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendVerificationEmail({
          to: email,
          subject: "AI Code Review - Verify your email",
          html: `
              <div style="font-family: 'Inter', Arial, sans-serif; max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 6px #0001; padding: 32px 28px;">
                <h2 style="font-size: 1.3rem; font-weight: 600; margin: 0 0 12px 0; color: #222;">
                  Verify your email address
                </h2>
                <p style="font-size: 1rem; color: #555; margin: 0 0 24px 0;">
                  Use the OTP below to verify your email address for AI Code Review.
                </p>
                <div style="text-align: center; margin: 18px 0 32px 0;">
                  <span style="display: inline-block; font-size: 2rem; letter-spacing: 8px; font-weight: bold; color: #2255a4; background: #f4f8fb; border-radius: 8px; padding: 10px 24px;">
                    ${otp}
                  </span>
                </div>
                <p style="font-size: 0.97rem; color: #888; margin-bottom: 0;">
                  This OTP is valid for the next 10 minutes. If you did not request this, you can ignore this email.
                </p>
                <div style="margin-top: 36px; font-size: 0.93rem; color: #ccc; border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
                  &copy; ${new Date().getFullYear()} AI Code Review
                </div>
              </div>
            `,
        });
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
