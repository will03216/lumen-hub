"use client";

/**
 * ModelDropdown — compact dropdown picker for the §03 Engine panel.
 *
 * Replaces the original vertical card list (ModelList) in the Image and
 * Video generators. The card list ate too much vertical real-estate on
 * narrow viewports and pushed Format/Settings off-screen; the dropdown
 * keeps the same affordance (label + hint preview + active highlight)
 * but collapses to a single row when idle.
 *
 * Built on the existing Radix-backed Select primitive so accessibility
 * (keyboard nav, ARIA, portal positioning) comes for free.
 *
 * Each option (and the trigger) is prefixed with a `BrandLogo` so users
 * can tell at a glance which provider runs which model.
 */

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { BrandLogo, resolveModelBrand } from "./brand-logo";

export type ModelDropdownItem = {
  id: string;
  label: string;
  hint?: string;
  /** Optional explicit provider; defaults are derived from the id. */
  provider?: string;
};

export function ModelDropdown({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: readonly ModelDropdownItem[];
}) {
  const selected = items.find((i) => i.id === value) ?? items[0];
  const selectedBrand = selected
    ? resolveModelBrand(selected.id, selected.provider)
    : "byteplus";
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-12 rounded-[12px] px-3.5 text-[14px] font-medium text-ink">
        <span className="flex items-center gap-2.5 min-w-0">
          <BrandLogo brand={selectedBrand} size="md" />
          <SelectValue>{selected?.label}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
        {items.map((m) => {
          const brand = resolveModelBrand(m.id, m.provider);
          return (
            <SelectItem key={m.id} value={m.id} className="py-2">
              <span className="flex items-start gap-2.5">
                <BrandLogo brand={brand} size="md" className="mt-0.5" />
                <span className="flex flex-col">
                  <span className="text-[13px] font-medium text-ink">
                    {m.label}
                  </span>
                  {m.hint && (
                    <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
                      {m.hint}
                    </span>
                  )}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
