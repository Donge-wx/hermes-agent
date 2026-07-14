import { cn } from '@/lib/utils'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

// VanYue Space Digital brand badge. The source mark is kept on its native
// black field so the supplied gradient and location-pin detail stay exact.
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center overflow-hidden',
        className
      )}
      {...props}
    >
      <img alt="" className="size-full object-contain" src={assetPath('vanyue-mark.png')} />
    </span>
  )
}
