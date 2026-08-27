import type { ComponentProps } from 'react'

import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'

interface PageLoaderProps extends Omit<ComponentProps<'div'>, 'children'> {
  label?: string
}

export function PageLoader({
  'aria-label': ariaLabel,
  className,
  label = 'Loading',
  role = 'status',
  ...props
}: PageLoaderProps) {
  return (
    <div
      {...props}
      aria-label={ariaLabel ?? label}
      className={cn('grid h-full place-items-center text-center', className)}
      data-slot="page-loader"
      role={role}
    >
      <div className="flex flex-col items-center">
        <div className="grid place-items-center" data-slot="page-loader-glyph">
          <Loader
            aria-hidden="true"
            className="text-primary/80"
            pathSteps={220}
            role="presentation"
            strokeScale={0.72}
            type="rose-curve"
          />
        </div>
        <span className="font-medium text-muted-foreground" data-slot="page-loader-label">
          {label}
        </span>
      </div>
    </div>
  )
}
