"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  return (
    <Select
      name={name}
      items={options.map((option) => ({
        value: option.key,
        label: option.name,
      }))}
      value={value}
      onValueChange={(key) => key && onChange(key)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label="Model"
        size="sm"
        className="h-8 w-auto min-w-0 shrink-0 border-transparent bg-transparent text-sm shadow-none hover:bg-accent focus-visible:ring-ring/24 data-popup-open:bg-accent sm:h-7 dark:bg-transparent dark:hover:bg-accent"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option) => (
          <SelectItem
            key={option.key}
            value={option.key}
            label={option.name}
            className="py-1.5"
          >
            <span className="col-start-2 row-start-2 text-xs whitespace-nowrap text-muted-foreground">
              {option.hint}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
