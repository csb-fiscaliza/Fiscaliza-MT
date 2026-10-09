import React from 'react';
import { InspectionData } from '../types/inspection';
import { createAuthenticitySeal, OFFICIAL_ANTI_PLAGIARISM_NOTICE } from '../utils/securityCrypto';
import { ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';

interface Props {
  docType: 'auto' | 'relatorio' | 'notificacao';
  content: string;
  data: InspectionData;
}

export const PrintableDocument: React.FC<Props> = ({ docType, content, data }) => {
  const seal = createAuthenticitySeal(
    data, 
    docType === 'auto' 
      ? 'AUTO DE INSPEÇÃO' 
      : docType === 'relatorio' 
      ? 'RELATÓRIO TÉCNICO' 
      : 'NOTIFICAÇÃO'
  );

  return (
    <div className="printable-document bg-white text-black p-8 sm:p-12 max-w-4xl mx-auto shadow-sm print:shadow-none print:p-0 print:m-0 font-serif leading-relaxed text-sm">
      {/* Official SEMA-MT Header */}
      <div className="border-b-2 border-emerald-800 pb-4 mb-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-800 flex items-center justify-center font-bold text-emerald-800 text-xs">
            MT
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-widest uppercase text-slate-900">
              Governo do Estado de Mato Grosso
            </h1>
            <h2 className="font-bold text-xs text-slate-800 uppercase">
              Secretaria de Estado de Meio Ambiente – SEMA-MT
            </h2>
            <h3 className="text-[11px] text-slate-700">
              Superintendência de Recursos Hídricos • Coordenadoria de Segurança de Barragens (CSB)
            </h3>
          </div>
        </div>

        <div className="inline-block px-3 py-0.5 mt-2 bg-slate-100 border border-slate-300 rounded text-[10px] font-sans font-semibold text-slate-600 uppercase tracking-wider">
          {docType === 'auto' && 'Minuta de Auto de Inspeção de Campo (CSB/SEMA-MT)'}
          {docType === 'relatorio' && 'Minuta de Relatório Técnico de Vistoria de Barragem'}
          {docType === 'notificacao' && 'Minuta de Notificação Técnica de Campo'}
        </div>
      </div>

      {/* Main Document Text Content */}
      <div className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-slate-900 leading-relaxed space-y-4">
        {content}
      </div>

      {/* Photo Annex for Technical Report */}
      {docType === 'relatorio' && data.photos.length > 0 && (
        <div className="mt-10 pt-6 border-t-2 border-slate-300 print:break-before-page">
          <h4 className="font-bold text-sm uppercase text-slate-900 mb-4 font-sans tracking-wide">
            Anexo Fotográfico de Campo ({data.photos.length} registros)
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {data.photos.map((photo, index) => (
              <div key={photo.id} className="border border-slate-300 rounded p-2 bg-slate-50 print:bg-white text-center">
                <div className="aspect-4/3 overflow-hidden bg-slate-200 mb-2">
                  <img
                    src={photo.dataUrl}
                    alt={photo.caption}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-left font-sans text-[11px]">
                  <p className="font-bold text-slate-900">
                    Foto {index + 1}: {photo.componentName}
                  </p>
                  <p className="text-slate-700 italic">
                    {photo.caption || 'Sem legenda'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Localização: {photo.locationDescription} | {photo.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selo Digital de Autenticidade e Anti-Plágio */}
      <div className="mt-10 p-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-[10px] font-sans">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-900">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>Selo Digital de Autenticidade, Rastreabilidade e Anti-Plágio (CSB/SEMA-MT)</span>
          </div>
          <span className="font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded">
            {seal.verificationCode}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 font-mono text-[9px]">
          <div>
            <strong>HASH SHA-256:</strong> <span className="break-all">{seal.sha256Hash}</span>
          </div>
          <div>
            <strong>DATA/HORA EMISSÃO:</strong> {seal.timestampFormatted}
          </div>
        </div>
        <p className="mt-2 text-[8px] text-slate-500 font-sans italic border-t border-slate-200 pt-1">
          {OFFICIAL_ANTI_PLAGIARISM_NOTICE}
        </p>
      </div>

      {/* Official Footer */}
      <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-500 font-sans">
        <p>Fiscaliza – Etapa de Campo CSB/SEMA-MT • Sistema de Registro de Vistorias em Barragens de Usos Múltiplos</p>
        <p className="mt-0.5">Centro Político Administrativo – Rua C, Bloco F – Cuiabá/MT – CEP: 78049-913</p>
      </div>
    </div>
  );
};
