import type { DesktopTheme } from './types'

/**
 * Liquid Glass — a light-first Apple 26-inspired palette.
 *
 * Geometry and optical material recipes live in styles/liquid-glass.css so
 * the same primitives remain authoritative for every theme.
 */
export const liquidGlassTheme: DesktopTheme = {
  name: 'liquid-glass',
  label: 'Liquid Glass',
  description: 'Layered optical glass in pearl, silver, and Apple blue',
  colors: {
    background: '#F5F7FA',
    foreground: '#1D1D1F',
    card: '#FCFDFF',
    cardForeground: '#1D1D1F',
    muted: '#EEF2F6',
    mutedForeground: '#6E747C',
    popover: '#F9FAFC',
    popoverForeground: '#1D1D1F',
    primary: '#0071E3',
    primaryForeground: '#FFFFFF',
    secondary: '#E8EEF5',
    secondaryForeground: '#25384C',
    accent: '#DDEBFA',
    accentForeground: '#163A60',
    border: '#C3CDD7',
    input: '#B8C4CF',
    ring: '#0071E3',
    midground: '#0071E3',
    midgroundForeground: '#FFFFFF',
    composerRing: '#0071E3',
    destructive: '#D70015',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#E8EDF3',
    sidebarBorder: '#C0CAD5',
    userBubble: '#E4EFFB',
    userBubbleBorder: '#B6D0EC'
  },
  darkColors: {
    background: '#11151B',
    foreground: '#F5F7FA',
    card: '#191E26',
    cardForeground: '#F5F7FA',
    muted: '#232A35',
    mutedForeground: '#A8B0BC',
    popover: '#202731',
    popoverForeground: '#F5F7FA',
    primary: '#0A84FF',
    primaryForeground: '#FFFFFF',
    secondary: '#20334A',
    secondaryForeground: '#D7E8FB',
    accent: '#183858',
    accentForeground: '#E3F1FF',
    border: '#354150',
    input: '#435164',
    ring: '#0A84FF',
    midground: '#0A84FF',
    midgroundForeground: '#FFFFFF',
    composerRing: '#0A84FF',
    destructive: '#FF453A',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#151B23',
    sidebarBorder: '#313C4A',
    userBubble: '#17324F',
    userBubbleBorder: '#285783'
  }
}
