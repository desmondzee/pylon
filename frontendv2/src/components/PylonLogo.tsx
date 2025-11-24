'use client'

interface PylonLogoProps {
  variant?: 'dark' | 'light'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
}

export default function PylonLogo({ variant = 'dark', size = 'md', showText = true }: PylonLogoProps) {
  const sizes = {
    sm: { icon: 28, text: 'text-lg', gap: 'gap-2' },
    md: { icon: 36, text: 'text-xl', gap: 'gap-2.5' },
    lg: { icon: 44, text: 'text-2xl', gap: 'gap-3' },
    xl: { icon: 56, text: 'text-3xl', gap: 'gap-4' },
  }

  const { icon, text, gap } = sizes[size]

  const isDark = variant === 'dark'
  const bgColor = isDark ? 'bg-pylon-dark' : 'bg-white'
  const iconColor = isDark ? '#ffffff' : '#0a0e1a'
  const textColor = isDark ? 'text-pylon-dark' : 'text-white'

  return (
    <div className={`flex items-center ${gap}`}>
      {/* Logo Icon - Network/Pylon convergence symbol */}
      <div
        className={`${bgColor} rounded-lg flex items-center justify-center shadow-sm`}
        style={{ width: icon, height: icon }}
      >
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: icon * 0.65, height: icon * 0.65 }}
        >
          {/* Central node */}
          <circle cx="20" cy="12" r="4" fill={iconColor}/>
          {/* Left branch */}
          <line x1="20" y1="12" x2="9" y2="32" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="9" cy="32" r="3" fill={iconColor}/>
          {/* Right branch */}
          <line x1="20" y1="12" x2="31" y2="32" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="31" cy="32" r="3" fill={iconColor}/>
          {/* Center stem */}
          <line x1="20" y1="12" x2="20" y2="34" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="20" cy="34" r="3" fill={iconColor}/>
        </svg>
      </div>
      {showText && (
        <span className={`font-semibold ${textColor} ${text} tracking-tight`}>Pylon</span>
      )}
    </div>
  )
}
