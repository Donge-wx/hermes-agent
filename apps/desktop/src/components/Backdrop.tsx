import { useStore } from '@nanostores/react'

import { BRAND, brandAssetPath } from '@/lib/brand'
import { $backdrop } from '@/store/backdrop'

export function Backdrop() {
  const on = useStore($backdrop)

  if (!on) {
    return null
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-2"
      data-slot="app-backdrop"
    >
      <img
        alt=""
        className="size-full object-cover object-center"
        fetchPriority="low"
        src={brandAssetPath('brand/ambient-background.svg')}
      />
      <img
        alt=""
        className="absolute max-w-none"
        data-slot="app-backdrop-symbol"
        fetchPriority="low"
        src={brandAssetPath(BRAND.symbolPath)}
      />
    </div>
  )
}
