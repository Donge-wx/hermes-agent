import { INSTALLER_BRAND, INSTALLER_BRAND_ASSETS } from '../lib/brand'
import { cn } from '../lib/utils'

// The installer consumes the same approved My King masters as Desktop. Vite
// fingerprints them into the installer bundle, so the packaged UI remains
// self-contained without maintaining a second copy of the logo.
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('inline-flex size-14 shrink-0 items-center justify-center', className)} {...props}>
      <img alt="" className="size-full object-contain" src={INSTALLER_BRAND_ASSETS.symbol} />
    </span>
  )
}

export function BrandLockup({ className, ...props }: React.ComponentProps<'img'>) {
  return (
    <img
      alt={INSTALLER_BRAND.accessibleName}
      className={cn('h-auto w-full object-contain', className)}
      src={INSTALLER_BRAND_ASSETS.lockup}
      {...props}
    />
  )
}
