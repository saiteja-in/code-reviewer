"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SunIcon,
  MoonIcon,
  PaintBucketIcon,
  ShuffleIcon,
  CheckCircle,
} from "lucide-react";
import {
  extractThemeColors,
  FetchedTheme,
  fetchThemeFromUrl,
  THEME_URLS,
  ThemePreset,
} from "@/lib/theme-utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const THEME_LOCAL_KEY = "themeSwitcher.selectedTheme";
const MODE_LOCAL_KEY = "themeSwitcher.mode";

export type ThemeMode = "light" | "dark";

function getStoredThemeUrl() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(THEME_LOCAL_KEY);
}

function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem(MODE_LOCAL_KEY) as ThemeMode) || "light";
}

function setStoredThemeUrl(url: string) {
  localStorage.setItem(THEME_LOCAL_KEY, url);
}

function setStoredThemeMode(mode: ThemeMode) {
  localStorage.setItem(MODE_LOCAL_KEY, mode);
}

function applyThemePreset(preset: ThemePreset, mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  [...root.style].forEach((prop) => {
    if (prop.startsWith("--")) root.style.removeProperty(prop);
  });
  const vars = {
    ...preset.cssVars.theme,
    ...(mode === "light" ? preset.cssVars.light : preset.cssVars.dark),
  };
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
}

function ThemeButton({
  theme,
  isSelected,
  onSelect,
  currentMode,
}: {
  theme: FetchedTheme;
  isSelected: boolean;
  onSelect: (theme: FetchedTheme) => void;
  currentMode: ThemeMode;
}) {
  const colors = theme.error
    ? []
    : extractThemeColors(theme.preset, currentMode);

  return (
    <button
      type="button"
      key={theme.url}
      onClick={() => onSelect(theme)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(theme);
        }
      }}
      className={[
        "w-full cursor-pointer overflow-hidden rounded-lg border transition-all duration-200 hover:scale-[1.02] hover:shadow-md text-left",
        isSelected
          ? "border-primary shadow-sm ring-2 ring-primary/20"
          : "border-border hover:border-primary/50",
        theme.error && "cursor-not-allowed opacity-50 hover:scale-100",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={!!theme.error}
      tabIndex={0}
    >
      <div className="flex items-center justify-between p-3">
        <div>
          <div className="font-medium text-sm">{theme.name}</div>
          {isSelected && (
            <div className="text-muted-foreground text-xs">Currently active</div>
          )}
        </div>
        {isSelected && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            <CheckCircle className="size-4 text-primary" />
          </div>
        )}
      </div>
      {colors.length > 0 && (
        <div className="flex h-2">
          {colors.map((color, index) => (
            <div
              key={index}
              className="flex-1"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
      {theme.error && (
        <div className="p-3 pt-2 text-destructive text-xs">
          Error: {theme.error}
        </div>
      )}
    </button>
  );
}

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>(getStoredThemeMode());
  const [selectedThemeUrl, setSelectedThemeUrl] = useState<string | null>(
    getStoredThemeUrl(),
  );
  const [themes, setThemes] = useState<FetchedTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const fetchRef = useRef(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const thisFetch = ++fetchRef.current;
    Promise.all(THEME_URLS.map(fetchThemeFromUrl)).then((loadedThemes) => {
      if (!ignore && fetchRef.current === thisFetch) {
        setThemes(loadedThemes);
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!themes.length) return;
    const theme =
      themes.find((t) => t.url === selectedThemeUrl) || themes[0];
    if (theme && !theme.error) {
      applyThemePreset(theme.preset, mode);
    }
  }, [themes, selectedThemeUrl, mode]);

  useEffect(() => {
    const storedUrl = getStoredThemeUrl();
    if (!storedUrl && themes.length) {
      setSelectedThemeUrl(themes[0].url);
    }
  }, [themes]);

  useEffect(() => {
    if (selectedThemeUrl) setStoredThemeUrl(selectedThemeUrl);
  }, [selectedThemeUrl]);

  useEffect(() => {
    setStoredThemeMode(mode);
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "light" ? "dark" : "light"));
  }, []);

  const randomizeTheme = useCallback(() => {
    const available = themes.filter((t) => !t.error);
    if (available.length > 0) {
      const idx = Math.floor(Math.random() * available.length);
      setSelectedThemeUrl(available[idx].url);
    }
  }, [themes]);

  const handleThemeSelect = (theme: FetchedTheme) => {
    if (!theme.error) setSelectedThemeUrl(theme.url);
  };

  const filteredThemes = themes.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="relative size-8 rounded-md"
        onClick={toggleMode}
        aria-label="Toggle theme mode"
      >
        <SunIcon className="dark:-rotate-90 h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:scale-0" />
        <MoonIcon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle mode</span>
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="flex size-8 items-center rounded-md"
            aria-label="Open theme selector"
          >
            <PaintBucketIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 md:w-80 p-0">
          <div className="p-3 pb-0">
            <h3 className="mb-1 text-sm font-semibold">Theme Selector</h3>
            <p className="text-muted-foreground text-xs mb-2">
              Choose a built-in theme for your interface
            </p>
            <Separator className="mb-2" />
            <div className="relative mb-2">
              <Input
                placeholder="Search themes..."
                className="h-9 rounded-none border-none bg-popover pl-10 shadow-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search themes"
              />
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <circle cx={11} cy={11} r={8} />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-muted-foreground text-sm">
                {loading ? "Loading..." : `${filteredThemes.length} themes`}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={randomizeTheme}
                disabled={loading || filteredThemes.length === 0}
                title="Random theme"
                aria-label="Random theme"
              >
                <ShuffleIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Separator />
          <ScrollArea className="h-72">
            <div className="p-3">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <svg className="size-4 animate-spin" viewBox="0 0 24 24">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="opacity-25"
                    />
                    <path
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      className="opacity-75"
                    />
                  </svg>
                  Loading themes...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {filteredThemes.map((theme) => (
                    <ThemeButton
                      key={theme.url}
                      theme={theme}
                      isSelected={selectedThemeUrl === theme.url}
                      onSelect={handleThemeSelect}
                      currentMode={mode}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
