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
import { PhotoSyncQueueModal } from './components/PhotoSyncQueueModal';
import { LoginPage } from './components/LoginPage';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { UsersManagementStep } from './components/UsersManagementStep';
import { EcosystemIntegrationModal, MasterSelectionPayload } from './components/EcosystemIntegrationModal';
import { FiscalizaLogo } from './components/FiscalizaLogo';
import { OfficialFooter } from './components/OfficialFooter';
import { InspectionProgressBar } from './components/InspectionProgressBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { EntidadeMestreTipo, InspectionData, SistemaOrigem } from './types/inspection';
import {
  applyMasterSelectionToInspection,
  listAlterationRequests,
  subscribeEcosystemUpdates
} from './services/administraEcosystemService';
import { getInspectorSession, signOutInspector, fetchLatestNumeroVistoriaFromSupabase } from './services/supabase';
import { 
  canUserCreateInspection, 
  canUserEditInspection, 
  canUserDeleteInspection
} from './services/userService';
import { 
  processAllPendingPhotoQueue, 
  enqueuePhotosFromInspection 
} from './services/photoSyncQueueService';
import { 
  WifiOff,
  Lock
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import { 
  createEmptyInspection, 
  getAllInspections, 
  saveInspection, 
  deleteInspection,
  getActiveInspectionId, 
  setActiveInspectionId,
  exportInspectionToJson,
  syncAllPendingInspections,
  syncSingleInspection,
  loadAllInspectionsWithFallback,
  isInspectionEmpty,
  isSampleInspection,
  purgeAllMockData,
  getNextVistoriaNumber
} from './services/storage';
import { formatGmsString } from './utils/geoCoordinates';
import { 
  validateAndSanitizeImportedInspection, 
  decryptTextAesGcm
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
  const previousInspectionBeforeNewRef = useRef<InspectionData | null>(null);

  const activeStepRef = useRef<number>(0);
  const currentInspectionRef = useRef<InspectionData>(currentInspection);
  const [showNewInspectionConfirm, setShowNewInspectionConfirm] = useState<boolean>(false);

  useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);

  useEffect(() => {
    currentInspectionRef.current = currentInspection;
  }, [currentInspection]);

  // Navegação entre etapas com cálculo de direção para animação suave de deslize (slide)
  const setActiveStep = (stepOrUpdater: number | ((prev: number) => number)) => {
    const current = activeStepRef.current;
    const next = typeof stepOrUpdater === 'function' ? stepOrUpdater(current) : stepOrUpdater;
    if (next !== current) {
      const currInsp = currentInspectionRef.current;
      // Se o usuário entrar em "Nova Ficha" mas sair sem preencher nada,
      // desconsiderar e não salvar automaticamente quando o preenchimento for zero (0%)
      if (current >= 1 && current <= 4 && (next === 0 || next >= 5)) {
        if (currInsp && isInspectionEmpty(currInsp)) {
          deleteInspection(currInsp.id);
          const validList = getAllInspections();
          const fallback = previousInspectionBeforeNewRef.current && !isInspectionEmpty(previousInspectionBeforeNewRef.current)
            ? previousInspectionBeforeNewRef.current
            : (validList.length > 0 ? validList[0] : createEmptyInspection());
          setCurrentInspection(fallback);
          setInspections(validList);
        }
      }

      setSlideDirection(next > current ? 1 : -1);
      prevStepRef.current = current;
      activeStepRef.current = next;
      setActiveStepState(next);
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        // fallback
      }
    }
  };

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [photoFilterComponent, setPhotoFilterComponent] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showPhotoQueueModal, setShowPhotoQueueModal] = useState<boolean>(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showEcosystemModal, setShowEcosystemModal] = useState<boolean>(false);
  const [ecosystemModalTab, setEcosystemModalTab] = useState<'status' | 'catalogo' | 'solicitacoes' | 'notificacoes'>('catalogo');
  const [ecosystemRequestTarget, setEcosystemRequestTarget] = useState<{
    entidadeTipo: EntidadeMestreTipo;
    entidadeId: string;
    entidadeNome: string;
    sistemaDetentor: SistemaOrigem;
    campoSugerido?: string;
    valorAtualSugerido?: string;
  } | null>(null);
  const [pendingAlterationCount, setPendingAlterationCount] = useState<number>(0);
  const [importCryptoPrompt, setImportCryptoPrompt] = useState<{ rawEnvelope: any } | null>(null);
  const [importPassphrase, setImportPassphrase] = useState<string>('');
  const [importCryptoError, setImportCryptoError] = useState<string>('');
  const [session, setSession] = useState<{ authenticated: boolean; email?: string; fullName?: string; role?: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'info' | 'error'; isRls?: boolean } | null>(null);
  const saveTimeoutRef = useRef<any>(null);
  const syncFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (syncFeedbackTimeoutRef.current) {
        window.clearTimeout(syncFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshPending = async () => {
      try {
        const reqs = await listAlterationRequests();
        if (active) {
          setPendingAlterationCount(reqs.filter(r => r.status === 'pendente').length);
        }
      } catch {}
    };
    refreshPending();
    const unsub = subscribeEcosystemUpdates(refreshPending);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Monitora sessão ativa do Fiscal e mudanças de autenticação
  useEffect(() => {
    let mounted = true;
    getInspectorSession()
      .then(sess => {
        if (!mounted) return;
        if (sess && sess.authenticated) {
          setSession(sess);
        } else {
          setSession(null);
        }
      })
      .catch(() => {
        if (mounted) setSession(null);
      })
      .finally(() => {
        if (mounted) setIsAuthLoading(false);
      });

    const handleAuthChanged = (e: any) => {
      if (e.detail?.authenticated) {
        setSession(e.detail);
      } else {
        setSession(null);
      }
    };

    window.addEventListener('csb:auth_state_changed', handleAuthChanged);
    return () => {
      mounted = false;
      window.removeEventListener('csb:auth_state_changed', handleAuthChanged);
    };
  }, []);

  const handleLogout = async () => {
    if (currentInspection && isInspectionEmpty(currentInspection)) {
      deleteInspection(currentInspection.id);
    }
    await signOutInspector();
    setSession(null);
  };

  // Monitora conectividade para resiliência no campo e sincronização automática ao restabelecer rede
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Ao restabelecer conexão, notifica e tenta sincronizar fichas e fotos pendentes
      setSyncFeedback({
        message: 'Rede restabelecida. Sincronizando fichas e fila de fotos com o banco...',
        type: 'info'
      });
      // Sincroniza fotos pendentes da fila do IndexedDB
      processAllPendingPhotoQueue().catch(err => {
        console.warn('[PhotoQueue] Auto-sync de fotos ao reconectar:', err);
      });
      syncAllPendingInspections().then(res => {
        const updatedList = getAllInspections();
        setInspections(updatedList);
        const curr = updatedList.find(i => i.id === currentInspectionRef.current.id);
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
      }).finally(() => {
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
  }, []);

  // Função para sincronização manual acionada pelo usuário
  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback({
      message: 'Transmitindo e sincronizando fichas criptografadas com o banco de dados...',
      type: 'info'
    });

    try {
      // Sincroniza fotos pendentes na fila do IndexedDB
      processAllPendingPhotoQueue().catch(err => {
        console.warn('[PhotoQueue] Aviso ao sincronizar fotos:', err);
      });

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
          message: 'Tudo em dia: todas as fichas e fotos já estão sincronizadas no banco de dados.',
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
      if (syncFeedbackTimeoutRef.current) {
        window.clearTimeout(syncFeedbackTimeoutRef.current);
      }
      syncFeedbackTimeoutRef.current = window.setTimeout(() => {
        setSyncFeedback(prev => (prev?.type === 'success' ? null : prev));
      }, 7000);
    }
  };

  // Inicializa dados com sincronização resiliente LocalStorage + IndexedDB e purga de dados fictícios
  useEffect(() => {
    purgeAllMockData().then(() => {
      return loadAllInspectionsWithFallback();
    }).then(list => {
      const cleanList = list.filter(insp => !isSampleInspection(insp) && !isInspectionEmpty(insp));
      setInspections(cleanList);

      // Assegura que todas as fotos estejam cadastradas na fila persistente do IndexedDB
      cleanList.forEach(insp => {
        enqueuePhotosFromInspection(insp).catch(() => {});
      });

      const activeId = getActiveInspectionId();
      if (activeId) {
        const found = cleanList.find(i => i.id === activeId);
        if (found && !isSampleInspection(found)) {
          setCurrentInspection(found);
          return;
        } else {
          setActiveInspectionId('');
        }
      }

      if (cleanList.length > 0) {
        setCurrentInspection(cleanList[0]);
      } else {
        const fresh = createEmptyInspection({
          email: session?.email,
          fullName: session?.fullName,
          id: (session as any)?.id
        });
        setCurrentInspection(fresh);
        setInspections([]);
      }
    }).catch(() => {
      const list = getAllInspections().filter(insp => !isSampleInspection(insp) && !isInspectionEmpty(insp));
      setInspections(list);
      if (list.length > 0) setCurrentInspection(list[0]);
    });
  }, []);

  // Guarda de segurança ativa: se currentInspection contiver qualquer dado fictício, expurga e reseta imediatamente
  useEffect(() => {
    if (currentInspection && isSampleInspection(currentInspection)) {
      deleteInspection(currentInspection.id);
      const fresh = createEmptyInspection({
        email: session?.email,
        fullName: session?.fullName,
        id: (session as any)?.id
      });
      setCurrentInspection(fresh);
    }
  }, [currentInspection]);

  // Proteção contra fechamento acidental da aba durante preenchimento em campo no tablet/celular
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentInspection && !isInspectionEmpty(currentInspection) && (currentInspection.damIdentification.damName || currentInspection.generalInfo.recordNumber)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentInspection]);

  // Auto-save debounced sempre que currentInspection for alterada
  useEffect(() => {
    if (!currentInspection?.id) return;

    // Se o usuário atual não tem permissão para editar esta vistoria, NÃO auto-salva modificações acidentais
    const editCheck = canUserEditInspection(session, currentInspection);
    if (!editCheck.allowed) return;

    // Se o preenchimento for zero (0%), desconsiderar e NÃO salvar automaticamente
    if (isInspectionEmpty(currentInspection)) {
      return;
    }

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
  }, [currentInspection, session]);

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

  const executeNewInspection = async () => {
    setShowNewInspectionConfirm(false);
    // Se a vistoria anterior não for vazia, salva a referência para restauração caso saia sem preencher
    if (currentInspection && !isInspectionEmpty(currentInspection)) {
      previousInspectionBeforeNewRef.current = currentInspection;
    }

    const fresh = createEmptyInspection({
      email: session?.email,
      fullName: session?.fullName || '',
      id: (session as any)?.id,
      cargo: (session as any)?.cargo || '',
      sector: (session as any)?.sector || ''
    });
    // NÃO salva automaticamente no storage quando o preenchimento for zero (0%)
    setCurrentInspection(fresh);
    setActiveStep(1); // Direciona para a Ficha

    // Atualiza a numeração caso haja registro mais recente em nuvem
    fetchLatestNumeroVistoriaFromSupabase().then(remoteNum => {
      if (remoteNum) {
        setCurrentInspection(prev => {
          if (
            prev.id === fresh.id && 
            prev.tipoPlanejamento !== 'futura' && 
            prev.generalInfo.tipoPlanejamento !== 'futura' &&
            (!prev.generalInfo.numeroVistoria || prev.generalInfo.numeroVistoria === fresh.generalInfo.numeroVistoria)
          ) {
            return {
              ...prev,
              generalInfo: {
                ...prev.generalInfo,
                numeroVistoria: remoteNum
              }
            };
          }
          return prev;
        });
      }
    }).catch(() => {});

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
          // Não salva automaticamente com preenchimento 0%
          return updated;
        }
        return prev;
      });
    }
  };

  const handleNewInspection = () => {
    if (!canUserCreateInspection(session?.role)) {
      setSyncFeedback({
        message: 'Perfil Visualizador: Acesso apenas para consulta. Seu perfil não possui permissão para criar novas fichas de vistoria.',
        type: 'error'
      });
      return;
    }

    if (currentInspection && !isInspectionEmpty(currentInspection)) {
      setShowNewInspectionConfirm(true);
    } else {
      executeNewInspection();
    }
  };

  const handleSaveInspection = async () => {
    const editCheck = canUserEditInspection(session, currentInspection);
    if (!editCheck.allowed) {
      setSyncFeedback({
        message: editCheck.reason || 'Você não possui permissão para salvar alterações nesta vistoria.',
        type: 'error'
      });
      return;
    }

    // Se o preenchimento for 0%, alerta o usuário
    if (isInspectionEmpty(currentInspection)) {
      setSyncFeedback({
        message: 'A ficha de vistoria está vazia (0% de preenchimento). Preencha ao menos o nome da barragem, empreendimento ou constatações antes de salvar.',
        type: 'info'
      });
      return;
    }

    // Se a ficha atual ainda não tiver autor registrado, vincula ao usuário logado sem mutação direta de estado
    const preparedInspection: InspectionData = !currentInspection.createdByEmail && session?.email
      ? {
          ...currentInspection,
          createdByEmail: session.email,
          createdByName: session.fullName || session.email
        }
      : currentInspection;

    if (preparedInspection !== currentInspection) {
      setCurrentInspection(preparedInspection);
    }

    const coords = preparedInspection.damIdentification.coordinates;
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
            createdByEmail: prev.createdByEmail || preparedInspection.createdByEmail,
            createdByName: prev.createdByName || preparedInspection.createdByName,
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
        saveInspection(preparedInspection);
        setInspections(getAllInspections());
      }
    } else {
      // Espaço editado manualmente pelo usuário: dados do usuário são integralmente preservados
      saveInspection(preparedInspection);
      setInspections(getAllInspections());
    }

    const now = new Date();
    setLastSavedAt(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
  };

  const handleSelectInspection = (id: string) => {
    // Se a ficha atual estiver com preenchimento zero (0%) e o usuário selecionar outra vistoria, desconsidera
    if (currentInspection && currentInspection.id !== id && isInspectionEmpty(currentInspection)) {
      deleteInspection(currentInspection.id);
    }
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

  const handleLoadSavedInspection = (
    target: InspectionData,
    options?: { convertToAtual?: boolean }
  ) => {
    if (currentInspection && currentInspection.id !== target.id) {
      if (isInspectionEmpty(currentInspection)) {
        deleteInspection(currentInspection.id);
      } else if (canUserEditInspection(session, currentInspection).allowed) {
        saveInspection(currentInspection);
      }
    }

    let prepared = target;
    if (options?.convertToAtual) {
      const today = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toTimeString().slice(0, 5);
      const nextNum = target.generalInfo?.numeroVistoria?.trim() || getNextVistoriaNumber();
      prepared = {
        ...target,
        tipoPlanejamento: 'atual',
        isDraft: true,
        generalInfo: {
          ...target.generalInfo,
          tipoPlanejamento: 'atual',
          numeroVistoria: nextNum,
          inspectionDate: target.generalInfo?.inspectionDate || today,
          startTime: target.generalInfo?.startTime || nowTime
        }
      };
      saveInspection(prepared);
    }

    setActiveInspectionId(prepared.id);
    setCurrentInspection(prepared);
    setInspections(getAllInspections());
  };

  const handleDeleteInspection = (id: string) => {
    const target = inspections.find(i => i.id === id);
    if (target) {
      const deleteCheck = canUserDeleteInspection(session, target);
      if (!deleteCheck.allowed) {
        setSyncFeedback({
          message: deleteCheck.reason || 'Você não possui permissão para excluir esta vistoria.',
          type: 'error'
        });
        return;
      }
    }

    deleteInspection(id);
    const remaining = getAllInspections();
    setInspections(remaining);

    if (currentInspection.id === id) {
      if (remaining.length > 0) {
        setCurrentInspection(remaining[0]);
      } else {
        const fresh = createEmptyInspection({
          email: session?.email,
          fullName: session?.fullName,
          id: (session as any)?.id
        });
        setCurrentInspection(fresh);
        setInspections([]);
      }
    }
  };

  const handleExportJson = () => {
    exportInspectionToJson(currentInspection);
  };

  const finalizeImportedInspection = (parsed: any) => {
    const validated = validateAndSanitizeImportedInspection(parsed);
    if (validated && validated.damIdentification && validated.generalInfo) {
      saveInspection(validated);
      setInspections(getAllInspections());
      setCurrentInspection(validated);
      setSyncFeedback({
        message: 'Vistoria importada, autenticada e protegida com sucesso.',
        type: 'success'
      });
    } else {
      setSyncFeedback({
        message: 'Arquivo JSON não possui a estrutura padrão de vistoria da CSB/SEMA-MT ou foi rejeitado na verificação de integridade.',
        type: 'error'
      });
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Suporte a envelope criptografado AES-GCM (exige senha definida na exportação)
        if (parsed && parsed.protocolo === 'SEMA-MT/CSB-ENCRYPTED-V1' && parsed.conteudoCriptografado) {
          setImportPassphrase('');
          setImportCryptoError('');
          setImportCryptoPrompt({ rawEnvelope: parsed });
          return;
        }

        finalizeImportedInspection(parsed);
      } catch (err) {
        console.error('Erro ao processar importação:', err);
        setSyncFeedback({
          message: 'Erro ao ler arquivo JSON. Verifique o formato ou integridade.',
          type: 'error'
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmEncryptedImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importCryptoPrompt?.rawEnvelope?.conteudoCriptografado) return;
    if (!importPassphrase.trim()) {
      setImportCryptoError('Informe a senha utilizada no momento da exportação criptografada.');
      return;
    }
    try {
      const decryptedStr = await decryptTextAesGcm(
        importCryptoPrompt.rawEnvelope.conteudoCriptografado,
        importPassphrase
      );
      const parsed = JSON.parse(decryptedStr);
      setImportCryptoPrompt(null);
      setImportPassphrase('');
      setImportCryptoError('');
      finalizeImportedInspection(parsed);
    } catch {
      setImportCryptoError('Senha inválida ou arquivo corrompido/adulterado.');
    }
  };

  const handleApplyMasterSelection = (payload: MasterSelectionPayload) => {
    setCurrentInspection(prev => applyMasterSelectionToInspection(prev, payload));
  };

  const handleGoToPhotosForComponent = (componentId: string) => {
    setPhotoFilterComponent(componentId);
    setActiveStep(3);
  };

  const userRole = (session?.role || '').toLowerCase();
  const isAdminUser = userRole === 'administrador' || userRole === 'admin';

  // Protege a etapa 7 (Módulo de Usuários): exclusivo para perfil Administrador
  useEffect(() => {
    if (activeStep === 7 && !isAdminUser) {
      setActiveStep(0);
    }
  }, [activeStep, isAdminUser]);

  if (isAuthLoading) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] selection:bg-emerald-500 selection:text-white">
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col items-center gap-4 text-center max-w-xs w-full backdrop-blur-md">
          <div className="p-2 rounded-2xl bg-white/5 border border-slate-700/60 shadow-inner">
            <FiscalizaLogo size="lg" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-black text-white tracking-tight">Fiscaliza MT</h2>
            <p className="text-xs text-slate-400 font-medium">Iniciando ambiente seguro CSB/SEMA-MT...</p>
          </div>
          <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mt-1" />
        </div>
      </div>
    );
  }

  // Página de Login Institucional: protege todo o sistema e exige autenticação
  if (!session || !session.authenticated) {
    return (
      <LoginPage
        onLoginSuccess={(newSession) => {
          setSession({
            authenticated: true,
            ...newSession
          });
        }}
        isOnline={isOnline}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Alerta de Modo Offline */}
      {!isOnline && (
        <div className="bg-amber-600 text-amber-50 px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] py-1.5 text-[11px] sm:text-xs font-semibold flex items-center justify-between shadow-xs print:hidden z-50">
          <div className="flex items-center gap-2 max-w-7xl 2xl:max-w-[1440px] mx-auto w-full">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-200" />
            <span>
              <strong>Dispositivo Offline / Sem Conexão:</strong> Operação de campo em modo local seguro ativada. Seus dados, medições e fotos estão salvos com criptografia no aparelho.
            </span>
          </div>
        </div>
      )}

      {/* Banner de Feedback de Sincronização */}
      {syncFeedback && (
        <div className={`px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] py-2 text-[11px] sm:text-xs font-semibold flex items-center justify-between shadow-xs print:hidden z-50 transition-all ${
          syncFeedback.type === 'success'
            ? 'bg-emerald-600 text-white'
            : syncFeedback.type === 'error'
            ? 'bg-rose-600 text-white'
            : 'bg-slate-800 text-slate-100'
        }`}>
          <div className="flex items-center justify-between max-w-7xl 2xl:max-w-[1440px] mx-auto w-full gap-2">
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

      {/* Header com Navegação e Perfil do Fiscal */}
      <Header
        currentInspection={currentInspection}
        activeStep={activeStep}
        setActiveStep={setActiveStep}
        onNewInspection={handleNewInspection}
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
        onOpenPhotoQueueModal={() => setShowPhotoQueueModal(true)}
        currentUser={session}
        onLogout={handleLogout}
        onOpenChangePassword={() => setShowChangePasswordModal(true)}
        onOpenEcosystemModal={() => {
          setEcosystemRequestTarget(null);
          setEcosystemModalTab('catalogo');
          setShowEcosystemModal(true);
        }}
        pendingAlterationCount={pendingAlterationCount}
      />

      {/* Barra de Progresso Visual de Preenchimento da Inspeção de Campo (visível apenas na Nova Ficha) */}
      {activeStep >= 1 && activeStep <= 5 && (
        <InspectionProgressBar
          currentInspection={currentInspection}
          activeStep={activeStep}
          onNavigateToStep={setActiveStep}
        />
      )}

      {/* Banner de Proteção contra Alterações Acidentais (Modo Somente Leitura) */}
      {activeStep >= 1 && activeStep <= 5 && !canUserEditInspection(session, currentInspection).allowed && (
        <div className="max-w-7xl 2xl:max-w-[1440px] w-full mx-auto px-2.5 xs:px-3 sm:px-5 lg:px-8 pt-3">
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-2xl p-3 sm:p-3.5 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-bold shrink-0 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-xs sm:text-sm">
                  Ficha em Modo Somente Leitura
                </p>
                <p className="text-[11px] sm:text-xs text-amber-800 dark:text-amber-300/90">
                  {canUserEditInspection(session, currentInspection).reason || 'Você está visualizando os dados de um colega sem permissão de edição.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveStep(0)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-950 dark:text-amber-100 font-bold text-xs shrink-0 self-start sm:self-auto cursor-pointer transition"
            >
              Voltar ao Painel
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl 2xl:max-w-[1440px] w-full mx-auto px-2.5 xs:px-3 sm:px-5 lg:px-8 pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] py-3.5 sm:py-5 lg:py-6 pb-[calc(7.25rem+env(safe-area-inset-bottom,0px))] lg:pb-8 overflow-x-clip">
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
                currentUser={session}
                onGoToSheet={() => setActiveStep(1)}
                onGoToDatabase={() => setActiveStep(6)}
                onGoToDocuments={() => setActiveStep(5)}
                onOpenSecurityModal={() => setShowSecurityModal(true)}
                onNewInspection={handleNewInspection}
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
                onPersistInspection={(updated) => {
                  const target = updated || currentInspection;
                  if (!isInspectionEmpty(target)) {
                    saveInspection(target);
                    setInspections(getAllInspections());
                    const now = new Date();
                    setLastSavedAt(
                      `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
                    );
                  }
                }}
                onSyncNow={handleSyncNow}
                isSyncing={isSyncing}
                savedInspections={inspections}
                onLoadSavedInspection={handleLoadSavedInspection}
                onOpenAuthModal={() => setShowAuthModal(true)}
                onOpenEcosystemModal={(opts) => {
                  setEcosystemModalTab(opts?.tab || 'catalogo');
                  setEcosystemRequestTarget(opts?.requestTarget || null);
                  setShowEcosystemModal(true);
                }}
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
                onSaveDraft={(updated) => {
                  const target = updated || currentInspection;
                  if (!isInspectionEmpty(target)) {
                    saveInspection(target);
                    setInspections(getAllInspections());
                  }
                }}
                onGoToSheet={() => setActiveStep(1)}
              />
            )}

            {/* PASSO 5: MINUTAS OFICIAIS */}
            {activeStep === 5 && (
              <DocumentReviewStep
                data={currentInspection}
                onChange={setCurrentInspection}
                onPrev={() => setActiveStep(4)}
                onSaveDraft={(updated) => {
                  const target = updated || currentInspection;
                  if (!isInspectionEmpty(target)) {
                    saveInspection(target);
                    setInspections(getAllInspections());
                  }
                }}
                onGoToSheet={() => setActiveStep(1)}
              />
            )}

            {/* PASSO 6: MÓDULO DE BANCO DE DADOS */}
            {activeStep === 6 && (
              <DatabaseModuleStep
                inspections={inspections}
                currentInspectionId={currentInspection.id}
                currentUser={session}
                onSelectAndEdit={handleSelectAndEdit}
                onDeleteInspection={handleDeleteInspection}
                onNewInspection={handleNewInspection}
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

            {/* PASSO 7: MÓDULO DE USUÁRIOS (EXCLUSIVO ADMINISTRADOR) */}
            {activeStep === 7 && isAdminUser && (
              <UsersManagementStep
                currentUser={session}
                onGoToDashboard={() => setActiveStep(0)}
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

      {/* Barra de Navegação Inferior Otimizada para Celular e Tablet */}
      <MobileBottomNav
        activeStep={activeStep}
        setActiveStep={setActiveStep}
        onSave={handleSaveInspection}
        lastSavedAt={lastSavedAt}
        currentInspection={currentInspection}
        onOpenNavMenu={() => window.dispatchEvent(new CustomEvent('csb:toggle_nav_menu'))}
        onOpenPhotoQueueModal={() => setShowPhotoQueueModal(true)}
        currentUser={session}
      />

      {/* Central de Fila de Sincronização Persistente de Fotos - IndexedDB */}
      <PhotoSyncQueueModal
        isOpen={showPhotoQueueModal}
        onClose={() => setShowPhotoQueueModal(false)}
        currentInspection={currentInspection}
        isOnline={isOnline}
      />

      {/* Modal Seguro de Alteração de Senha do Fiscal */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        userEmail={session?.email}
      />

      {/* Central de Integração do Ecossistema CSB (Administra / Classifica / Notifica) */}
      <EcosystemIntegrationModal
        isOpen={showEcosystemModal}
        onClose={() => setShowEcosystemModal(false)}
        currentInspection={currentInspection}
        currentUser={session}
        onApplyMasterSelection={handleApplyMasterSelection}
        initialTab={ecosystemModalTab}
        initialRequestTarget={ecosystemRequestTarget}
      />

      {/* Modal de Senha para Importação de Arquivo Criptografado AES-GCM */}
      {importCryptoPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmEncryptedImport}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-4 sm:p-5 space-y-4 my-auto"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Arquivo Criptografado AES-GCM-256
                </h3>
                <p className="text-[11px] text-slate-500">
                  Informe a senha definida durante a exportação segura do arquivo.
                </p>
              </div>
            </div>

            <input
              type="password"
              autoFocus
              required
              value={importPassphrase}
              onChange={e => setImportPassphrase(e.target.value)}
              placeholder="Senha do envelope criptografado"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />

            {importCryptoError && (
              <p className="text-xs font-semibold text-rose-600">{importCryptoError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setImportCryptoPrompt(null);
                  setImportPassphrase('');
                  setImportCryptoError('');
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
              >
                Descriptografar e Importar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Confirmação para Nova Vistoria em Branco */}
      {showNewInspectionConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm max-h-[92dvh] overflow-y-auto p-4 sm:p-5 space-y-4 my-auto">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Iniciar Nova Vistoria em Branco?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              A ficha atual já possui dados preenchidos e continuará salva automaticamente no aparelho. Deseja abrir uma nova ficha limpa?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewInspectionConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeNewInspection}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
              >
                Sim, Nova Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
