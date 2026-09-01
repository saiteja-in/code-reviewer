import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/user";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";
import { JsonLd, getHomeJsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = createMetadata({
  absoluteTitle: siteConfig.seoTitle,
  description: siteConfig.seoDescription,
  path: "/",
});

export default async function Home() {
  const user = await currentUser();
  const primaryHref = user ? "/repos" : "/login";
  const primaryLabel = user ? "Open dashboard" : "Create account";

  return (
    <>
      <JsonLd data={getHomeJsonLd()} />
      <div className="landing">
      <section className="landing-hero">
        <div className="landing-float" aria-hidden="true">
          <pre className="landing-float-bit">{`+ guard(user)
+ return next()`}</pre>
          <pre className="landing-float-bit">{`src/lib/session.ts
L18  token.expires`}</pre>
          <pre className="landing-float-bit">{`conclusion: "success"`}</pre>
          <pre className="landing-float-bit">{`- query(raw)
+ query(escape(raw))`}</pre>
        </div>
        <div className="landing-inner">
          <div className="landing-hero-stack">
            <p className="landing-brand" aria-label={siteConfig.name}>
              AI Code Review
            </p>
            <h1 className="landing-line">Reviews land on the PR.</h1>
            <p className="m-0 text-muted-foreground">
              An AI reviewer for GitHub pull requests. Install the App and
              every PR gets line-by-line comments and a check run - posted
              where you already review :)
            </p>
            <p className="m-0 text-muted-foreground">
              Each review includes a summary, a 0–100 risk score, and inline
              comments on the lines that matter. The bot writes on GitHub.
              This dashboard is for connecting repos and running a review by
              hand when you need to.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="lg">
                <Link href={primaryHref}>{primaryLabel}</Link>
              </Button>
              {!user && (
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
            </div>

            <svg
              className="landing-squiggle"
              viewBox="0 0 280 18"
              fill="none"
              aria-hidden="true"
            >
              <path
                pathLength="1"
                d="M2 10 C18 4 28 16 42 9 C54 3 62 14 78 11 C92 7 104 2 118 10 C130 16 142 14 156 8 C170 3 182 15 198 11 C212 6 224 4 240 12 C252 16 264 8 278 10"
              />
            </svg>

            <figure className="landing-hero-proof m-0 w-full text-left font-[family-name:var(--font-landing-mono)] text-sm">
              <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start">
                <span className="text-xs tracking-widest uppercase text-muted-foreground">
                  Checks
                </span>
                <p className="m-0 min-w-0">
                  AI Code Review ·{" "}
                  <Badge variant="secondary">completed</Badge>
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start">
                <span className="text-xs tracking-widest uppercase text-muted-foreground">
                  Comment
                </span>
                <p className="m-0 min-w-0">
                  Risk 34/100 · src/auth.ts:41 · P1 unescaped query
                  <span className="landing-caret" aria-hidden="true" />
                </p>
              </div>
            </figure>
          </div>
        </div>
      </section>

      <Separator />

      <section className="py-24">
        <div className="landing-inner">
          <h2 className="landing-section-head mb-10">How a review starts</h2>
          <ol className="m-0 flex list-none flex-col p-0">
            <li className="grid gap-1 border-t border-border py-10">
              <span className="font-[family-name:var(--font-landing-mono)] text-xs tracking-wide text-primary">
                1.0
              </span>
              <h3 className="m-0 font-[family-name:var(--font-landing-display)] text-lg font-semibold">
                Create an account
              </h3>
              <p className="m-0 max-w-[52ch] text-muted-foreground">
                Sign in with GitHub or email. Link GitHub so the dashboard can
                list your repositories.
              </p>
            </li>
            <li className="grid gap-1 border-t border-border py-10">
              <span className="font-[family-name:var(--font-landing-mono)] text-xs tracking-wide text-primary">
                2.0
              </span>
              <h3 className="m-0 font-[family-name:var(--font-landing-display)] text-lg font-semibold">
                Connect a repo, then install the App
              </h3>
              <p className="m-0 max-w-[52ch] text-muted-foreground">
                Import the repo here, then install the GitHub App on the same
                repo. That is what posts as the bot.
              </p>
            </li>
            <li className="grid gap-1 border-t border-border py-10">
              <span className="font-[family-name:var(--font-landing-mono)] text-xs tracking-wide text-primary">
                3.0
              </span>
              <h3 className="m-0 font-[family-name:var(--font-landing-display)] text-lg font-semibold">
                Open a pull request
              </h3>
              <p className="m-0 max-w-[52ch] text-muted-foreground">
                Non-draft PRs get a review automatically. You can also run one
                from the dashboard.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <Separator />

      <section className="py-24">
        <div className="landing-inner flex flex-col items-start gap-6">
          <p className="m-0 max-w-[28ch] font-[family-name:var(--font-landing-display)] text-xl font-semibold">
            Ready when the next PR is.
          </p>
          <Button asChild size="lg">
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
        </div>
      </section>

      <footer className="landing-inner flex flex-wrap gap-x-6 gap-y-2 border-t border-border py-8 font-[family-name:var(--font-landing-mono)] text-xs text-muted-foreground">
        <span>AI Code Review</span>
        <Button asChild variant="link" className="h-auto p-0 text-xs">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild variant="link" className="h-auto p-0 text-xs">
          <Link href="/repos">Repositories</Link>
        </Button>
      </footer>
    </div>
    </>
  );
}
