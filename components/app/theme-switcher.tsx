"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useEffect } from "react";
import { useStored } from "@/lib/ui/storage";
import { isTheme, THEME_KEY, type Theme } from "@/lib/ui/theme";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const satisfies readonly { value: Theme; label: string; icon: unknown }[];

function apply(theme: Theme): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeSwitcher() {
  const [stored, store] = useStored(THEME_KEY);
  const theme: Theme = isTheme(stored) ? stored : "system";

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [theme]);

  return (
    <fieldset className="flex items-center gap-0.5 rounded-full bg-sidebar-accent p-0.5">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label
          key={value}
          title={label}
          className={cn(
            "relative flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring",
            theme === value &&
              "bg-background text-foreground shadow-xs dark:bg-accent",
          )}
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={() => store(value)}
            className="sr-only"
          />
          <Icon aria-hidden className="size-3.5" />
          <span className="sr-only">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
