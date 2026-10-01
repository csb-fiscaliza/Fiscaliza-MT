// ==============================================================================
// ARQUIVO: src/components/FiscalizaLogo.tsx
// Logotipo Oficial Fiel e Exato do Sistema Fiscaliza MT (CSB / SEMA-MT)
// Utiliza com exatidão a arte gráfica original sem qualquer alteração no desenho
// ==============================================================================

import React from 'react';
import fiscalizaLogoImg from '../assets/fiscaliza_logo.png';

interface FiscalizaLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  withBackground?: boolean;
  alt?: string;
}

export const FISCALIZA_LOGO_SRC = fiscalizaLogoImg;

export const FiscalizaLogo: React.FC<FiscalizaLogoProps> = ({
  className = '',
  size = 'md',
  withBackground = true,
  alt = 'Logotipo Oficial Fiscaliza MT - CSB / SEMA-MT'
}) => {
  const sizeMap = {
    xs: 'w-7 h-7',
    sm: 'w-9 h-9',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
    '2xl': 'w-32 h-32'
  };

  const chosenSize = sizeMap[size] || sizeMap.md;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${chosenSize} ${
        withBackground
          ? 'bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/10 p-1 overflow-hidden'
          : ''
      } ${className}`}
    >
      <img
        src={fiscalizaLogoImg}
        alt={alt}
        className="w-full h-full object-contain pointer-events-none select-none"
        loading="eager"
        decoding="sync"
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src !== window.location.origin + '/fiscaliza_logo.png') {
            target.src = '/fiscaliza_logo.png';
          }
        }}
      />
    </div>
  );
};
