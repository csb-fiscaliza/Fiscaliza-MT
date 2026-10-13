// ==============================================================================
// ARQUIVO: src/App.tsx
// Aplicação Principal - Fiscaliza CSB/SEMA-MT
// Página Inicial com Painel de Controle, Ficha de Inspeção, Fotos de Campo,
// Conclusões, Minutas Oficiais e Módulo de Banco de Dados de Vistorias.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { DashboardStep } from './components/DashboardStep';
import { OfficialInspectionSheetStep } from './components/OfficialInspectionSheetStep';
import { ComponentsInspectionStep } from './components/ComponentsInspectionStep';
import { PhotoManagerStep } from './components/PhotoManagerStep';
import { ConclusionsStep } from './components/ConclusionsStep';
import { DocumentReviewStep } from './components/DocumentReviewStep';
import { DatabaseModuleStep } from './components/DatabaseModuleStep';
import { OperationalReviewModal } from './components/OperationalReviewModal';
import { InspectorAuthModal } from './components/InspectorAuthModal';
import { OfficialFooter } from './components/OfficialFooter';
import { InspectionProgressBar } from './components/InspectionProgressBar';
import { InspectionData } from './types/inspection';
import { 
  WifiOff 
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import { 
  createEmptyInspection, 
  createSampleInspection, 
  getAllInspections, 
  saveInspection, 
  deleteInspection,
  getActiveInspectionId, 
  setActiveInspectionId,
  exportInspectionToJson,
  syncAllPendingInspections,
  syncSingleInspection
} from './services/storage';
import { formatGmsString } from './utils/geoCoordinates';
import { 
  validateAndSanitizeImportedInspection, 
  decryptTextAesGcm,
  createAuthenticitySeal
} from './utils/securityCrypto';

// Variantes para animação de deslize (slide) suave entre as etapas (0 a 6) para tablets e campo
const stepSlideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
  }),
};

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [inspections, setInspections] = useState<InspectionData[]>([]);
  const [currentInspection, setCurrentInspection] = useState<InspectionData>(createEmptyInspection());
  // activeStep 0 = Painel de Controle (Página Inicial)
  // activeStep 1 = 1. Ficha Completa SEMA-MT
  // activeStep 2 = 2. Componentes Estruturais
  // activeStep 3 = 3. Fotos de Campo
  // activeStep 4 = 4. Conclusões & Notificação
  // activeStep 5 = 5. Minutas Oficiais
  // activeStep 6 = Banco de Dados
  const [activeStep, setActiveStepState] = useState<number>(0);
  const [slideDirection, setSlideDirection] = useState<number>(1);
  const prevStepRef = useRef<number>(0);

  // Navegação entre etapas com cálculo de direção para animação suave de deslize (slide)
  const setActiveStep = (stepOrUpdater: number | ((prev: number) => number)) => {
    setActiveStepState(current => {
      const next = typeof stepOrUpdater === 'function' ? stepOrUpdater(current) : stepOrUpdater;
      if (next !== current) {
        setSlideDirection(next > current ? 1 : -1);
        prevStepRef.current = current;
        try {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
          // fallback
        }
      }
      return next;
    });
  };

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [photoFilterComponent, setPhotoFilterComponent] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'info' | 'error'; isRls?: boolean } | null>(null);
  const saveTimeoutRef = useRef<any>(null);

  // Monitora conectividade para resiliência no campo e sincronização automática ao restabelecer rede
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Ao restabelecer conexão, notifica e tenta sincronizar fichas pendentes
      setSyncFeedback({
        message: 'Rede restabelecida. Sincronizando fichas salvas localmente...',
        type: 'info'
      });
      syncAllPendingInspections().then(res => {
        const updatedList = getAllInspections();
        setInspections(updatedList);
        const curr = updatedList.find(i => i.id === currentInspection.id);
        if (curr) setCurrentInspection(curr);

        if (res.synced > 0) {
          setSyncFeedback({
            message: `${res.synced} vistoria(s) sincronizada(s) com sucesso no banco de dados centralizado.`,
            type: 'success'
          });
        } else if (res.total === 0) {
          setSyncFeedback(null);
        } else if (res.hasRlsError) {
          setSyncFeedback({
            message: 'Banco em nuvem protegido por regras RLS. Vistorias preservadas com segurança localmente.',
            type: 'info',
            isRls: true
          });
        }
      }).catch(() => {
        setIsSyncing(false);
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncFeedback({
        message: 'Dispositivo sem internet. Modo local seguro ativo: todas as fichas serão gravadas com criptografia no aparelho.',
        type: 'info'
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentInspection.id]);

  // Função para sincronização manual acionada pelo usuário
  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback({
      message: 'Transmitindo e sincronizando fichas criptografadas com o banco de dados...',
      type: 'info'
    });

    try {
      const res = await syncAllPendingInspections();
      const updatedList = getAllInspections();
      setInspections(updatedList);
      const curr = updatedList.find(i => i.id === currentInspection.id);
      if (curr) setCurrentInspection(curr);

      if (res.synced > 0) {
        setSyncFeedback({
          message: `Sucesso! ${res.synced} ficha(s) sincronizada(s) e confirmada(s) no banco de dados.`,
          type: 'success'
        });
      } else if (res.total === 0) {
        setSyncFeedback({
          message: 'Tudo em dia: todas as fichas já estão sincronizadas no banco de dados.',
          type: 'success'
        });
      } else {
        const isRls = res.hasRlsError || (res.errors[0] && (res.errors[0].includes('RLS') || res.errors[0].includes('42501')));
        setSyncFeedback({
          message: res.errors[0] || 'Dados mantidos salvos com segurança no dispositivo.',
          type: isRls ? 'info' : 'error',
          isRls: !!isRls
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        message: 'Dados mantidos salvos no dispositivo. Sincronização pendente.',
        type: 'info'
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncFeedback(prev => (prev?.type === 'success' ? null : prev));
      }, 7000);
    }
  };

  // Inicializa dados do LocalStorage
  useEffect(() => {
    const list = getAllInspections();
    setInspections(list);

    const activeId = getActiveInspectionId();
    if (activeId) {
      const found = list.find(i => i.id === activeId);
      if (found) {
        setCurrentInspection(found);
        return;
      }
    }

    if (list.length > 0) {
      setCurrentInspection(list[0]);
    } else {
      const sample = createSampleInspection();
      saveInspection(sample);
      setInspections([sample]);
      setCurrentInspection(sample);
    }
  }, []);

  // Auto-save debounced sempre que currentInspection for alterada
  useEffect(() => {
    if (!currentInspection?.id) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveInspection(currentInspection);
      const list = getAllInspections();
      setInspections(list);
      const now = new Date();
      setLastSavedAt(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
    }, 600);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [currentInspection]);

  // Captura geolocalização do dispositivo via API do navegador para o local da barragem
  const captureBrowserLocation = (): Promise<{
    latitude: string;
    longitude: string;
    accuracyMeters: number;
    altitudeMeters: number | null;
    captureTimestamp: string;
  } | null> => {
    return new Promise(resolve => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          const latGms = formatGmsString(pos.coords.latitude, true, false);
          const lngGms = formatGmsString(pos.coords.longitude, false, false);
          resolve({
            latitude: latGms,
            longitude: lngGms,
            accuracyMeters: Math.round(pos.coords.accuracy * 10) / 10,
            altitudeMeters: pos.coords.altitude !== null ? Math.round(pos.coords.altitude * 10) / 10 : null,
            captureTimestamp: new Date().toISOString()
          });
        },
        err => {
          console.warn('Geolocalização não obtida:', err.message);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleNewInspection = async () => {
    let proceed = true;
    try {
      proceed = window.confirm('Deseja iniciar uma nova vistoria em branco? Os dados da vistoria atual foram salvos automaticamente.');
    } catch {
      proceed = true;
    }
    if (proceed) {
      const fresh = createEmptyInspection();
      saveInspection(fresh);
      setCurrentInspection(fresh);
      setInspections(getAllInspections());
      setActiveStep(1); // Direciona para a Ficha

      // Captura precisa de coordenadas do navegador ao iniciar a inspeção
      const loc = await captureBrowserLocation();
      if (loc) {
        setCurrentInspection(prev => {
          // Se o usuário ainda não alterou manualmente as coordenadas deste formulário
          if (prev.id === fresh.id && !prev.damIdentification.coordinates.isManualEdit) {
            const updated: InspectionData = {
              ...prev,
              damIdentification: {
                ...prev.damIdentification,
                coordinates: {
                  ...prev.damIdentification.coordinates,
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  accuracyMeters: loc.accuracyMeters,
                  altitudeMeters: loc.altitudeMeters,
                  captureTimestamp: loc.captureTimestamp,
                  isManualEdit: false
                }
              }
            };
            saveInspection(updated);
            setInspections(getAllInspections());
            return updated;
          }
          return prev;
        });
      }
    }
  };

  const handleSaveInspection = async () => {
    const coords = currentInspection.damIdentification.coordinates;
    const isManual = coords.isManualEdit;
    const hasLat = !!coords.latitude?.trim();
    const hasLng = !!coords.longitude?.trim();

    // Se o usuário NÃO editou manualmente o espaço de coordenadas ou se estiver vazio,
    // captura a geolocalização via API do navegador
    if (!isManual || !hasLat || !hasLng) {
      const loc = await captureBrowserLocation();
      if (loc) {
        setCurrentInspection(prev => {
          // Mantém editável se o usuário editou manualmente durante a chamada
          if (prev.damIdentification.coordinates.isManualEdit && prev.damIdentification.coordinates.latitude) {
            saveInspection(prev);
            return prev;
          }
          const updated: InspectionData = {
            ...prev,
            damIdentification: {
              ...prev.damIdentification,
              coordinates: {
                ...prev.damIdentification.coordinates,
                latitude: loc.latitude,
                longitude: loc.longitude,
                accuracyMeters: loc.accuracyMeters,
                altitudeMeters: loc.altitudeMeters,
                captureTimestamp: loc.captureTimestamp,
                isManualEdit: false
              }
            }
          };
          saveInspection(updated);
          setInspections(getAllInspections());
          return updated;
        });
      } else {
        saveInspection(currentInspection);
        setInspections(getAllInspections());
      }
    } else {
      // Espaço editado manualmente pelo usuário: dados do usuário são integralmente preservados
      saveInspection(currentInspection);
      setInspections(getAllInspections());
    }

    const now = new Date();
    setLastSavedAt(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
  };

  const handleLoadSample = () => {
    let proceed = true;
    try {
      proceed = window.confirm('Carregar exemplo didático de teste de campo? (Fazenda Alvorada - Poconé/MT)');
    } catch {
      proceed = true;
    }
    if (proceed) {
      const sample = createSampleInspection();
      saveInspection(sample);
      setCurrentInspection(sample);
      setInspections(getAllInspections());
      setActiveStep(0); // Mostra no painel
    }
  };

  const handleSelectInspection = (id: string) => {
    const found = inspections.find(i => i.id === id);
    if (found) {
      setActiveInspectionId(id);
      setCurrentInspection(found);
    }
  };

  const handleSelectAndEdit = (id: string) => {
    handleSelectInspection(id);
    setActiveStep(1); // Leva para a Ficha de Inspeção
  };

  const handleDeleteInspection = (id: string) => {
    deleteInspection(id);
    const remaining = getAllInspections();
    setInspections(remaining);

    if (currentInspection.id === id) {
      if (remaining.length > 0) {
        setCurrentInspection(remaining[0]);
      } else {
        const fresh = createEmptyInspection();
        saveInspection(fresh);
        setCurrentInspection(fresh);
        setInspections([fresh]);
      }
    }
  };

  const handleExportJson = () => {
    exportInspectionToJson(currentInspection);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const content = event.target?.result as string;
        let parsed = JSON.parse(content);

        // Suporte a envelope criptografado AES-GCM
        if (parsed && parsed.protocolo === 'SEMA-MT/CSB-ENCRYPTED-V1' && parsed.conteudoCriptografado) {
          try {
            const decryptedStr = await decryptTextAesGcm(parsed.conteudoCriptografado);
            parsed = JSON.parse(decryptedStr);
          } catch (decErr) {
            console.error('Falha ao descriptografar arquivo protegido:', decErr);
            alert('Falha na autenticação/chave do arquivo criptografado.');
            return;
          }
        }

        // Sanitização profunda anti-poluição de protótipo e validação de integridade
        const validated = validateAndSanitizeImportedInspection(parsed);
        if (validated && validated.damIdentification && validated.generalInfo) {
          saveInspection(validated);
          setInspections(getAllInspections());
          setCurrentInspection(validated);
          alert('Vistoria importada, autenticada e protegida com sucesso!');
        } else {
          alert('Arquivo JSON não possui a estrutura padrão de vistoria da CSB/SEMA-MT ou foi rejeitado na verificação de integridade.');
        }
      } catch (err) {
        console.error('Erro ao processar importação:', err);
        alert('Erro ao ler arquivo JSON. Verifique o formato ou integridade.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleGoToPhotosForComponent = (componentId: string) => {
    setPhotoFilterComponent(componentId);
    setActiveStep(3);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Alerta de Modo Offline */}
      {!isOnline && (
        <div className="bg-amber-600 text-amber-50 px-3 py-1.5 text-xs font-semibold flex items-center justify-between shadow-xs print:hidden z-50">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-200" />
            <span>
              <strong>Dispositivo Offline / Sem Conexão:</strong> Operação de campo em modo local seguro ativada. Seus dados, medições e fotos estão salvos com criptografia no aparelho.
            </span>
          </div>
        </div>
      )}

      {/* Banner de Feedback de Sincronização */}
      {syncFeedback && (
        <div className={`px-3 py-2 text-xs font-semibold flex items-center justify-between shadow-xs print:hidden z-50 transition-all ${
          syncFeedback.type === 'success'
            ? 'bg-emerald-600 text-white'
            : syncFeedback.type === 'error'
            ? 'bg-rose-600 text-white'
            : 'bg-slate-800 text-slate-100'
        }`}>
          <div className="flex items-center justify-between max-w-7xl mx-auto w-full gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-current animate-ping shrink-0" />
              <span>{syncFeedback.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {syncFeedback.isRls && (
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] shadow-xs transition cursor-pointer"
                >
                  Resolver Permissão / Entrar
                </button>
              )}
              <button
                type="button"
                onClick={() => setSyncFeedback(null)}
                className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header com Navegação */}
      <Header
        currentInspection={currentInspection}
        activeStep={activeStep}
        setActiveStep={setActiveStep}
        onNewInspection={handleNewInspection}
        onLoadSample={handleLoadSample}
        onSave={handleSaveInspection}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        allInspections={inspections}
        onSelectInspection={handleSelectInspection}
        lastSavedAt={lastSavedAt}
        isOnline={isOnline}
        onOpenSecurityReview={() => setShowSecurityModal(true)}
        onSyncNow={handleSyncNow}
        isSyncing={isSyncing}
        onOpenAuthModal={() => setShowAuthModal(true)}
      />

      {/* Barra de Progresso Visual de Preenchimento da Inspeção de Campo (visível apenas na Nova Ficha) */}
      {activeStep >= 1 && activeStep <= 5 && (
        <InspectionProgressBar
          currentInspection={currentInspection}
          activeStep={activeStep}
          onNavigateToStep={setActiveStep}
        />
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
        <AnimatePresence mode="wait" custom={slideDirection} initial={false}>
          <motion.div
            key={activeStep}
            custom={slideDirection}
            variants={stepSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: 0.28,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="w-full focus:outline-hidden"
          >
            {/* PASSO 0: PAINEL DE CONTROLE (PÁGINA INICIAL) */}
            {activeStep === 0 && (
              <DashboardStep
                currentInspection={currentInspection}
                allInspections={inspections}
                onGoToSheet={() => setActiveStep(1)}
                onGoToDatabase={() => setActiveStep(6)}
                onGoToDocuments={() => setActiveStep(5)}
                onOpenSecurityModal={() => setShowSecurityModal(true)}
                onNewInspection={handleNewInspection}
                onLoadSample={handleLoadSample}
                onSelectAndEdit={handleSelectAndEdit}
                onDeleteInspection={handleDeleteInspection}
                isOnline={isOnline}
                lastSavedAt={lastSavedAt}
                onSyncSingle={async (id) => {
                  const res = await syncSingleInspection(id);
                  const updated = getAllInspections();
                  setInspections(updated);
                  const curr = updated.find(i => i.id === currentInspection.id);
                  if (curr) setCurrentInspection(curr);
                  setSyncFeedback({
                    message: res.success ? 'Ficha sincronizada e salva no banco de dados com sucesso.' : (res.error || 'Erro na sincronização.'),
                    type: res.success ? 'success' : 'info',
                    isRls: res.isRlsError
                  });
                }}
                onSyncAll={handleSyncNow}
                isSyncing={isSyncing}
              />
            )}

            {/* PASSO 1: FICHA COMPLETA SEMA-MT */}
            {activeStep === 1 && (
              <OfficialInspectionSheetStep
                data={currentInspection}
                onChange={setCurrentInspection}
                onNext={() => setActiveStep(2)}
                onPrev={() => setActiveStep(0)}
                onSave={handleSaveInspection}
                onSyncNow={handleSyncNow}
                isSyncing={isSyncing}
                onOpenAuthModal={() => setShowAuthModal(true)}
              />
            )}

            {/* PASSO 2: PAINEL POR COMPONENTES */}
            {activeStep === 2 && (
              <ComponentsInspectionStep
                data={currentInspection}
                onChange={setCurrentInspection}
                onNext={() => setActiveStep(3)}
                onPrev={() => setActiveStep(1)}
                onGoToPhotosForComponent={handleGoToPhotosForComponent}
              />
            )}

            {/* PASSO 3: FOTOS DE CAMPO */}
            {activeStep === 3 && (
              <PhotoManagerStep
                data={currentInspection}
                onChange={setCurrentInspection}
                onNext={() => setActiveStep(4)}
                onPrev={() => setActiveStep(2)}
                initialComponentFilter={photoFilterComponent}
              />
            )}

            {/* PASSO 4: CONCLUSÕES & NOTIFICAÇÃO */}
            {activeStep === 4 && (
              <ConclusionsStep
                data={currentInspection}
                onChange={setCurrentInspection}
                onNext={() => setActiveStep(5)}
                onPrev={() => setActiveStep(3)}
              />
            )}

            {/* PASSO 5: MINUTAS OFICIAIS */}
            {activeStep === 5 && (
              <DocumentReviewStep
                data={currentInspection}
                onChange={setCurrentInspection}
                onPrev={() => setActiveStep(4)}
              />
            )}

            {/* PASSO 6: MÓDULO DE BANCO DE DADOS */}
            {activeStep === 6 && (
              <DatabaseModuleStep
                inspections={inspections}
                currentInspectionId={currentInspection.id}
                onSelectAndEdit={handleSelectAndEdit}
                onDeleteInspection={handleDeleteInspection}
                onNewInspection={handleNewInspection}
                onLoadSample={handleLoadSample}
                onGoToSheet={() => setActiveStep(1)}
                onSyncSingle={async (id) => {
                  const res = await syncSingleInspection(id);
                  const updated = getAllInspections();
                  setInspections(updated);
                  const curr = updated.find(i => i.id === currentInspection.id);
                  if (curr) setCurrentInspection(curr);
                  setSyncFeedback({
                    message: res.success ? 'Ficha sincronizada e salva no banco de dados com sucesso.' : (res.error || 'Erro na sincronização.'),
                    type: res.success ? 'success' : 'info',
                    isRls: res.isRlsError
                  });
                }}
                onSyncAll={handleSyncNow}
                isSyncing={isSyncing}
                onOpenAuthModal={() => setShowAuthModal(true)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Rodapé Oficial Fiscaliza MT de Alta Disponibilidade */}
      <OfficialFooter />

      {/* Modal de Auditoria e Governança CSB/SEMA-MT */}
      <OperationalReviewModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        data={currentInspection}
        isOnline={isOnline}
        lastSavedAt={lastSavedAt}
      />

      {/* Modal de Acesso Seguro do Fiscal & Resolução RLS */}
      <InspectorAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleSyncNow}
      />
    </div>
  );
}
