// src/components/agents/DomainSelector.tsx
// Reusable stroke-only domain selector trigger & popover dropdown with icons.
// Only shows options that are default (system, crm, content, pages) or on-demand if installed.

import { component$, type Signal, type PropFunction, $ } from "@builder.io/qwik";
import { LuChevronDown, LuCheck } from "@qwikest/icons/lucide";
import { useAppContext } from "~/lib/app-context";
import { DOMAIN_OPTIONS, getDomainIcon, isDomainAvailable } from "./agent-commands";

export interface DomainSelectorProps {
  selectedDomain: Signal<string>;
  isOpen: Signal<boolean>;
  onSelect$: PropFunction<(domainId: string) => void>;
  align?: "left" | "right";
  buttonStyle?: string;
}

export const DomainSelector = component$<DomainSelectorProps>(({
  selectedDomain,
  isOpen,
  onSelect$,
  align = "right",
  buttonStyle = "height:1.875rem;padding:0 0.5rem;border-radius:0.375rem;background:transparent;border:1px solid var(--border);color:var(--text-primary);display:inline-flex;align-items:center;gap:0.35rem;font-size:0.75rem;font-weight:500;cursor:pointer;transition:border-color 0.15s ease;",
}) => {
  const ctx = useAppContext();
  const installed = ctx.installedApps.value;
  const visibleDomains = DOMAIN_OPTIONS.filter((d) => isDomainAvailable(d.id, installed));
  const currentDomain = visibleDomains.find((d) => d.id === selectedDomain.value) || visibleDomains[0] || DOMAIN_OPTIONS[0];
  const CurrentIcon = getDomainIcon(currentDomain.id);

  return (
    <div style="position:relative;">
      <button
        type="button"
        data-agent-trigger="true"
        onClick$={$(() => {
          isOpen.value = !isOpen.value;
        })}
        style={buttonStyle}
        title="Filter agent tool domain"
      >
        <CurrentIcon style="width:0.75rem;height:0.75rem;color:var(--text-secondary);flex-shrink:0;" />
        <span style="white-space:nowrap;">{currentDomain.shortName}</span>
        <LuChevronDown style="width:0.6875rem;height:0.6875rem;color:var(--text-secondary);opacity:0.6;" />
      </button>

      {isOpen.value && (
        <div
          data-agent-popover="true"
          style={`position:absolute;${align === "left" ? "left:0;" : "right:0;"}top:calc(100% + 6px);width:175px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 12px 32px rgba(0,0,0,0.22);z-index:100;padding:0.25rem;display:flex;flex-direction:column;gap:2px;`}
        >
          {visibleDomains.map((d) => {
            const isSelected = d.id === selectedDomain.value;
            const Icon = getDomainIcon(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick$={$(() => onSelect$(d.id))}
                style={`width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.75rem;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;transition:background 0.15s;${
                  isSelected
                    ? "background:var(--surface-3);font-weight:600;color:var(--text-primary);"
                    : "background:transparent;color:var(--text-secondary);"
                }`}
              >
                <div style="display:flex;align-items:center;gap:0.4rem;min-width:0;">
                  <Icon style="width:0.75rem;height:0.75rem;color:var(--text-secondary);flex-shrink:0;" />
                  <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{d.name}</span>
                </div>
                {isSelected && (
                  <LuCheck style="width:0.75rem;height:0.75rem;color:var(--accent, #6366f1);flex-shrink:0;" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
