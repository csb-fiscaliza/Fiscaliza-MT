// ==============================================================================
// ARQUIVO: src/components/ThemeToggle.tsx
// Componente de Seleção de Visualização: Modo Claro / Modo Escuro
// Visual moderno, acessível e ergonômico para operação em gabinete e campo
// ==============================================================================

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  variant?: 'compact' | 'segmented';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'segmented', className = '' }) => {
  const { theme, setTheme, toggleTheme } = useTheme();

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`p-1.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-center ${
          theme === 'dark'
            ? 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 shadow-xs'
        } ${className}`}
        title={theme === 'dark' ? 'Mudar para Visualização Clara' : 'Mudar para Visualização Escura'}
        aria-label="Alternar visualização clara e escura"
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4 text-amber-300" />
        ) : (
          <Moon className="w-4 h-4 text-slate-600" />
        )}
      </button>
    );
  }

  return (
    <div 
      className={`inline-flex items-center p-0.5 rounded-lg border text-xs font-medium transition-colors ${
        theme === 'dark'
          ? 'bg-slate-900 border-slate-800 text-slate-300'
          : 'bg-slate-100 border-slate-200 text-slate-600'
      } ${className}`}
      role="group"
      aria-label="Controle de visualização claro ou escuro"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
          theme === 'light'
            ? 'bg-white text-slate-900 shadow-xs font-semibold'
            : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-100'
        }`}
        title="Visualização Clara (ideal para ambientes iluminados e impressão)"
      >
        <Sun className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-500' : 'text-slate-400'}`} />
        <span className="hidden sm:inline">Claro</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-slate-800 text-emerald-300 shadow-xs font-semibold border border-slate-700/60'
            : 'text-slate-500 hover:text-slate-800'
        }`}
        title="Visualização Escura (ideal para trabalho noturno e conforto visual)"
      >
        <Moon className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-emerald-400' : 'text-slate-400'}`} />
        <span className="hidden sm:inline">Escuro</span>
      </button>
    </div>
  );
};
