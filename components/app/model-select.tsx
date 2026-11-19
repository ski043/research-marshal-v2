"use client";

import { ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ModelOption = { key: string; name: string; hint: string };

/** The model of the next run (M1). The form field `name` carries the choice. */
export function ModelSelect({
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  options: readonly ModelOption[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const current = options.find((option) => option.key === value);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label={`Model: ${current?.name ?? value}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-accent aria-expanded:text-foreground"
        >
          {current?.name ?? value}
          <ChevronDownIcon aria-hidden className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56 p-1">
          <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.key}
                value={option.key}
                closeOnClick
                className="items-start py-1.5"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{option.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
