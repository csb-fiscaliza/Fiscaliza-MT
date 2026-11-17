// ==============================================================================
// ARQUIVO: src/components/OfficialFooter.tsx
// Rodapé Oficial do Sistema Fiscaliza MT (CSB / SEMA-MT)
// Adaptado a partir da identidade de alta disponibilidade e engenharia de software
// ==============================================================================

import React from 'react';
import { FiscalizaLogo } from './FiscalizaLogo';

export const OfficialFooter: React.FC = () => {
  return (
    <footer className="w-full bg-[#0b1325] text-white border-t-2 border-emerald-500 print:hidden select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Linha Principal do Rodapé */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Lado Esquerdo: Logo do Sistema + Título + Subtítulo */}
          <div className="flex items-center gap-4">
            {/* Logotipo Oficial com Mapa MT e Barragem */}
            <FiscalizaLogo size="lg" className="shadow-md" />

            <div className="flex flex-col">
              {/* Título Principal Adaptado de SISB para Fiscaliza MT com Seta Verde */}
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold italic tracking-tight text-white font-sans">
                  Fiscaliza MT
                </span>
                <span className="text-emerald-400 text-xl sm:text-2xl font-bold transition-transform hover:translate-x-1">
                  →
                </span>
              </div>

              {/* Subtítulo em Verde Esmeralda */}
              <span className="text-emerald-400 font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase mt-0.5">
                SEGURANÇA DE BARRAMENTOS DE ÁGUA – SEMA/MT
              </span>
            </div>
          </div>

          {/* Centro: Indicador de Alta Disponibilidade */}
          <div className="flex items-center gap-2 text-slate-300 text-xs tracking-[0.22em] font-semibold uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            <span>SISTEMAS DE ALTA DISPONIBILIDADE</span>
          </div>

          {/* Lado Direito: Créditos de Engenharia de Software e Design */}
          <div className="flex flex-col lg:items-end text-left lg:text-right">
            <span className="text-[10px] tracking-[0.25em] text-slate-400 font-semibold uppercase">
              ENGENHARIA DE SOFTWARE E DESIGN
            </span>
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-0.5">
              Yara Dias
            </span>
          </div>
        </div>

        {/* Linha Inferior com Copyright e Direitos Reservados */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-400 font-mono tracking-[0.2em]">
          <span>
            SUPERINTENDÊNCIA DE RECURSOS HÍDRICOS (SURH) • GOVERNO DE MATO GROSSO
          </span>
          <span className="text-slate-300 font-medium">
            CSB – SURH / SEMA/MT © 2026 • TODOS OS DIREITOS RESERVADOS
          </span>
        </div>
      </div>
    </footer>
  );
};
