// ==============================================================================
// ARQUIVO: src/components/FutureObservationChecklist.tsx
// Componente de Itens a Serem Observados (Checklist de Campo / Atenção Especial)
// No modo "Vistoria Futura": Permite pré-cadastrar itens e sugestões para ida a campo.
// No modo "Vistoria Atual": Apresenta os itens em formato de "check" interativo
// para o fiscal confirmar se lembrou de inspecionar cada ponto durante a vistoria.
// ==============================================================================

import React, { useState } from 'react';
import { 
  ClipboardList, 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Sparkles,
  Eye,
  CheckCheck
} from 'lucide-react';
import { ItemObservacaoFutura } from '../types/inspection';

interface Props {
  tipoPlanejamento: 'atual' | 'futura' | undefined;
  items?: ItemObservacaoFutura[];
  onChange: (items: ItemObservacaoFutura[]) => void;
  className?: string;
}

const SUGESTOES_RAPIDAS = [
  'Verificar trincas/fissuras no vertedouro de concreto',
  'Avaliar presença de umidade/surgências no pé do talude de jusante',
  'Medir cota da borda livre e largura da crista',
  'Conferir leitura da régua limnimétrica',
  'Checar desobstrução das canaletas de drenagem superficial',
  'Inspecionar presença de tocas/formigueiros nos taludes',
  'Fotografar assoreamento ou erosão nas margens do reservatório',
  'Verificar integridade do canal de dissipação e restituição'
];

export const FutureObservationChecklist: React.FC<Props> = ({
  tipoPlanejamento = 'atual',
  items = [],
  onChange,
  className = ''
}) => {
  const [novoItemTexto, setNovoItemTexto] = useState('');
  const isFutura = tipoPlanejamento === 'futura';

  const handleAddItem = (texto?: string) => {
    const txt = (texto !== undefined ? texto : novoItemTexto).trim();
    if (!txt) return;

    // Evita duplicatas idênticas consecutivas
    if (items.some(i => i.texto.toLowerCase() === txt.toLowerCase())) {
      setNovoItemTexto('');
      return;
    }

    const novoItem: ItemObservacaoFutura = {
      id: 'obs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      texto: txt,
      concluido: false,
      criadoEm: new Date().toISOString()
    };

    onChange([...items, novoItem]);
    setNovoItemTexto('');
  };

  const handleToggleCheck = (id: string) => {
    const updated = items.map(it => {
      if (it.id === id) {
        const nextConcluido = !it.concluido;
        return {
          ...it,
          concluido: nextConcluido,
          concluidoEm: nextConcluido ? new Date().toISOString() : undefined
        };
      }
      return it;
    });
    onChange(updated);
  };

  const handleRemoveItem = (id: string) => {
    onChange(items.filter(it => it.id !== id));
  };

  const total = items.length;
  const concluidos = items.filter(i => i.concluido).length;
  const todosConcluidos = total > 0 && concluidos === total;

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs ${
      isFutura 
        ? 'bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 border-indigo-200' 
        : 'bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/50 border-emerald-200'
    } ${className}`}>
      {/* Cabeçalho do Bloco */}
      <div className={`p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-b ${
        isFutura ? 'border-indigo-100/90' : 'border-emerald-100/90'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-xs shrink-0 ${
            isFutura 
              ? 'bg-indigo-600 text-white' 
              : 'bg-emerald-600 text-white'
          }`}>
            {isFutura ? <ClipboardList className="w-5 h-5" /> : <CheckCheck className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                Itens a Serem Observados
              </h3>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                isFutura 
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300' 
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                {isFutura ? 'Atenção Especial na Ida' : 'Checklist de Confirmação em Campo'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {isFutura 
                ? 'Liste pontos críticos, pendências anteriores ou estruturas a inspecionar com atenção redobrada no local.' 
                : 'Confirme com um "check" cada item pré-planejado para garantir que nada foi esquecido durante a fiscalização.'}
            </p>
          </div>
        </div>

        {/* Badge de Progresso */}
        {total > 0 && (
          <div className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-2 border shadow-2xs ${
            isFutura
              ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
              : todosConcluidos
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
              : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}>
            {isFutura ? (
              <>
                <Eye className="w-4 h-4 text-indigo-600" />
                <span>{total} item(ns) listado(s)</span>
              </>
            ) : (
              <>
                {todosConcluidos ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>
                  {concluidos} de {total} verificado(s) {todosConcluidos && '✓'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Campo de Inclusão de Novo Item */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
            <span>{isFutura ? 'Adicionar item para observar em campo:' : 'Adicionar novo ponto ao checklist:'}</span>
            <span className="text-[10px] text-slate-500 font-normal">Pressione Enter ou clique em Adicionar</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={novoItemTexto}
              onChange={e => setNovoItemTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
              placeholder={
                isFutura 
                  ? 'Ex: Verificar se foi consertada a erosão na ombreira esquerda apontada no relatório anterior...' 
                  : 'Ex: Registrar medição do piezômetro P-02...'
              }
              className="flex-1 min-h-[44px] px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
            <button
              type="button"
              onClick={() => handleAddItem()}
              disabled={!novoItemTexto.trim()}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer select-none shadow-xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                isFutura 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar</span>
            </button>
          </div>
        </div>

        {/* Sugestões Rápidas de Campo com 1 Toque */}
        {isFutura && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Sugestões rápidas de atenção em campo (toque para adicionar):</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES_RAPIDAS.map((sug, idx) => {
                const jaAdicionado = items.some(i => i.texto === sug);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={jaAdicionado}
                    onClick={() => handleAddItem(sug)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border text-left transition cursor-pointer select-none active:scale-95 flex items-center gap-1.5 ${
                      jaAdicionado
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default opacity-60'
                        : 'bg-white hover:bg-indigo-50/80 hover:text-indigo-900 text-slate-700 border-indigo-200/80 shadow-2xs'
                    }`}
                  >
                    <span>{jaAdicionado ? '✓' : '+'}</span>
                    <span>{sug}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Lista de Itens */}
        {total === 0 ? (
          <div className="text-center py-6 px-4 rounded-xl border border-dashed border-slate-300 bg-white/60 text-slate-500 text-xs space-y-1">
            <p className="font-semibold text-slate-700">
              Nenhum item adicionado à lista de observação.
            </p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              {isFutura
                ? 'Digite acima os itens a serem verificados ou clique nas sugestões para criar o roteiro da vistoria.'
                : 'Quando planejar uma vistoria futura, os itens pré-salvos aparecerão aqui em formato de check para confirmar a inspeção.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 pb-1">
              <span>{isFutura ? 'Lista de Itens para a Vistoria:' : 'Checklist de Verificação no Campo:'}</span>
              <span className="text-[11px] text-slate-500 font-normal">
                {isFutura ? `${total} item(ns)` : `${concluidos}/${total} conferidos`}
              </span>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                      !isFutura && item.concluido
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs'
                        : !isFutura
                        ? 'bg-amber-50/60 border-amber-300 text-slate-900 shadow-2xs ring-1 ring-amber-400/20'
                        : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-800 shadow-2xs'
                    }`}
                  >
                    {/* Modo Vistoria Atual: Botão de Check Interativo */}
                    {!isFutura ? (
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(item.id)}
                        className="flex items-start gap-3 flex-1 text-left cursor-pointer group"
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-all shadow-2xs ${
                          item.concluido
                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                            : 'bg-white border-2 border-amber-400 text-transparent hover:border-emerald-500 group-hover:scale-105'
                        }`}>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`text-xs sm:text-sm font-semibold leading-snug ${
                            item.concluido 
                              ? 'line-through text-emerald-800 dark:text-emerald-700 opacity-80' 
                              : 'text-slate-900 font-bold'
                          }`}>
                            {item.texto}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                              item.concluido 
                                ? 'bg-emerald-200/80 text-emerald-900 font-extrabold' 
                                : 'bg-amber-200/80 text-amber-900 animate-pulse'
                            }`}>
                              {item.concluido ? 'Verificado no local ✓' : 'Atenção: Lembrar de verificar!'}
                            </span>
                            {item.concluidoEm && (
                              <span className="text-[10px] text-emerald-700/80">
                                Confirmado às {new Date(item.concluidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ) : (
                      /* Modo Vistoria Futura: Visualizador com Numeração e Exclusão */
                      <div className="flex items-start gap-3 flex-1">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-slate-800 leading-snug">
                            {item.texto}
                          </p>
                          <span className="text-[10px] text-slate-400 mt-0.5 block">
                            Ponto de atenção especial para ida a campo
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Botão de Excluir Item */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                      title="Remover este item da lista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
