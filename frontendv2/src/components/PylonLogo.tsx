'use client'

import Image from 'next/image'

interface PylonLogoProps {
  variant?: 'dark' | 'light'
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export default function PylonLogo({ variant = 'dark', size = 'md' }: PylonLogoProps) {
  const sizes = {
    sm: { height: 28, gap: 'gap-2' },
    md: { height: 36, gap: 'gap-2.5' },
    lg: { height: 44, gap: 'gap-3' },
    xl: { height: 56, gap: 'gap-4' },
  }

  const { height, gap } = sizes[size]

  const logoSrc = variant === 'dark' ? '/assets/pylon-logo-dark.png' : '/assets/pylon-logo-light.png'

  return (
    <div className={`flex items-center ${gap}`}>
      <Image
        src={logoSrc}
        alt="Pylon Logo"
        width={height * 2.5}
        height={height}
        priority
        className="object-contain"
      />
    </div>
  )
}
