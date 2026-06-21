"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeSwitcher } from "@/components/themes/theme-switcher";
import { UserDropdown } from "@/components/UserDropdown";
import { cn } from "@/lib/utils";

const navigationLinks = [
  { href: "/", label: "Home" },
  { href: "/repos", label: "Repositories" },
  { href: "/reviews", label: "Reviews" },
];

export default function NavbarClient({
  user,
}: {
  user: {
    name?: string | null;
    email: string;
    image?: string | null;
  } | null;
}) {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      <div className="flex h-16 items-center justify-between gap-4 container mx-auto">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                className="group size-8 md:hidden"
                variant="ghost"
                size="icon"
              >
                <svg
                  className="pointer-events-none"
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 12L20 12"
                    className="origin-center -translate-y-[7px] transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.1)] group-aria-expanded:translate-x-0 group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[315deg]"
                  />
                  <path
                    d="M4 12H20"
                    className="origin-center transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.8)] group-aria-expanded:rotate-45"
                  />
                  <path
                    d="M4 12H20"
                    className="origin-center translate-y-[7px] transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.1)] group-aria-expanded:translate-y-0 group-aria-expanded:rotate-[135deg]"
                  />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-40 p-1 md:hidden">
              <NavigationMenu className="max-w-none *:w-full">
                <NavigationMenuList className="flex-col items-start gap-0 md:gap-2">
                  {navigationLinks.map((link) => (
                    <NavigationMenuItem key={link.href} className="w-full">
                      <NavigationMenuLink
                        href={link.href}
                        className="py-1.5"
                        active={isActive(link.href)}
                      >
                        {link.label}
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  ))}
                </NavigationMenuList>
              </NavigationMenu>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center space-x-2 text-primary hover:text-primary/90"
            >
              <span className="font-bold">AI Code Review</span>
            </Link>
            <NavigationMenu className="max-md:hidden">
              <NavigationMenuList className="gap-2">
                {navigationLinks.map((link) => (
                  <NavigationMenuItem key={link.href}>
                    <NavigationMenuLink
                      active={isActive(link.href)}
                      href={link.href}
                      className={cn(
                        "text-muted-foreground hover:text-primary py-1.5 font-medium",
                        isActive(link.href) && "text-foreground",
                      )}
                    >
                      {link.label}
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeSwitcher />

          {user ? (
            isLoggingOut ? (
              <div className="size-9 flex items-center justify-center">
                <svg
                  className="animate-spin h-6 w-6 text-muted-foreground"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
            ) : (
              <UserDropdown
                email={user.email}
                image={
                  user.image ?? `https://avatar.vercel.sh/${user.email}`
                }
                name={
                  user.name && user.name.length > 0
                    ? user.name
                    : user.email.split("@")[0]
                }
                onLogoutStart={() => setIsLoggingOut(true)}
                onLogoutEnd={() => setIsLoggingOut(false)}
              />
            )
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-sm">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild size="sm" className="text-sm">
                <Link href="/login">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
