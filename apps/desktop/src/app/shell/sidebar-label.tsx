import type * as React from 'react'

import { cn } from '@/lib/utils'

interface SidebarPanelLabelProps extends React.ComponentProps<'span'> {
  dotClassName?: string
}

export function SidebarPanelLabel({ children, className, dotClassName, ...props }: SidebarPanelLabelProps) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)',
        className
      )}
      data-slot="sidebar-panel-label"
      {...props}
    >
      {dotClassName && (
        <span
          aria-hidden="true"
          className={cn('inline-block size-2 shrink-0 rounded-full', dotClassName)}
          data-slot="sidebar-panel-status"
        />
      )}
      <span className="min-w-0 truncate leading-none">{children}</span>
    </span>
  )
}
