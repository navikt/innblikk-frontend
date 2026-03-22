/**
 * SidebarSection
 *
 * A simple always-visible sidebar section with an optional heading row.
 * The heading row can hold a title on the left and an action (e.g. reset button) on the right.
 * Uses Bleed to extend the background to the sidebar edges, with reflectivePadding to keep
 * inner content aligned.
 */

import { Bleed, Box } from "@navikt/ds-react";
import type { ReactNode } from "react";

interface SidebarSectionProps {
  /** Section heading text */
  title?: string;
  /** Optional action rendered to the right of the title (e.g. a tertiary Button) */
  action?: ReactNode;
  children: ReactNode;
  /** Extra class names on the inner Box element */
  className?: string;
}

export function SidebarSection({
  title,
  action,
  children,
  className,
}: SidebarSectionProps) {
  const sectionClassName = `pb-4 ${className ?? ''}`.trim();

  return (
    <Bleed asChild marginInline="space-24" reflectivePadding>
      <Box background="sunken" className={sectionClassName}>
        {(title || action) && (
          <div className="flex items-center justify-between mb-3">
            {title && (
              <span className="text-base font-semibold text-(--ax-text-default)">
                {title}
              </span>
            )}
            {action && <div>{action}</div>}
          </div>
        )}
        {children}
      </Box>
    </Bleed>
  );
}

export default SidebarSection;
