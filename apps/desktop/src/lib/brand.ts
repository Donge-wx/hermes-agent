export const BRAND = {
  accessibleName: 'My King — AI WROK OS',
  appIconPath: 'apple-touch-icon.png',
  lockupPath: 'brand/my-king-lockup.png',
  name: 'My King',
  symbolPath: 'brand/my-king-symbol.png',
  tagline: 'AI WROK OS'
} as const

export function brandAssetPath(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}

export function publicAgentName(name: string): string {
  const normalized = name.trim().toLowerCase()

  return normalized === 'default' || normalized === 'hermes' ? BRAND.name : name
}

export function publicBrandText(text: string): string {
  return text
    .replace(/(?<![./\\])\bhermes:connection\b/gi, `${BRAND.name} connection`)
    .replace(/(?<![./\\])\bHermes\b(?![./\\])/g, BRAND.name)
}
