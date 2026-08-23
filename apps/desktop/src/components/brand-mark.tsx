import { BRAND, brandAssetPath } from '@/lib/brand'
import { cn } from '@/lib/utils'

interface BrandMarkProps extends React.ComponentProps<'span'> {
  readonly decorative?: boolean
}

// Canonical My King glyph. The transparent source is shared by onboarding,
// updates, About, notifications, and the shell so every brand moment agrees.
export function BrandMark({ className, decorative = true, ...props }: BrandMarkProps) {
  return (
    <span className={cn('inline-flex size-14 shrink-0 items-center justify-center', className)} {...props}>
      <img
        alt={decorative ? '' : BRAND.accessibleName}
        className="size-full object-contain"
        src={brandAssetPath(BRAND.symbolPath)}
      />
    </span>
  )
}
