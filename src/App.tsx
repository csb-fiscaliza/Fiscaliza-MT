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
import { OfficialFooter } from './components/OfficialFooter';
import { InspectionData } from './types/inspection';
import { 
  WifiOff 
} from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { 
  createEmptyInspection, 
  createSampleInspection, 
  getAllInspections, 
  saveInspection, 
  deleteInspection,
  getActiveInspectionId, 
  setActiveInspectionId,
  exportInspectionToJson
} from './services/storage';

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
  const [activeStep, setActiveStep] = useState<number>(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [photoFilterComponent, setPhotoFilterComponent] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);
  const saveTimeoutRef = useRef<any>(null);

  // Monitora conectividade para resiliência no campo
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  const handleNewInspection = () => {
    if (confirm('Deseja iniciar uma nova vistoria em branco? Os dados da vistoria atual foram salvos automaticamente.')) {
      const fresh = createEmptyInspection();
      saveInspection(fresh);
      setCurrentInspection(fresh);
      setInspections(getAllInspections());
      setActiveStep(1); // Direciona para a Ficha
    }
  };

  const handleLoadSample = () => {
    if (confirm('Carregar exemplo didático de teste de campo? (Fazenda Alvorada - Poconé/MT)')) {
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
    reader.onload = event => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && parsed.damIdentification && parsed.generalInfo) {
          saveInspection(parsed);
          setInspections(getAllInspections());
          setCurrentInspection(parsed);
          alert('Vistoria importada com sucesso!');
        } else {
          alert('Arquivo JSON não possui a estrutura padrão de vistoria da CSB/SEMA-MT.');
        }
      } catch (err) {
        alert('Erro ao ler arquivo JSON. Verifique o formato.');
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
              <strong>Dispositivo Offline / Sem Conexão:</strong> Operação de campo em modo local seguro ativada. Seus dados, medições e fotos permanecem íntegros e salvos no dispositivo.
            </span>
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
        onSave={() => saveInspection(currentInspection)}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        allInspections={inspections}
        onSelectInspection={handleSelectInspection}
        lastSavedAt={lastSavedAt}
        isOnline={isOnline}
        onOpenSecurityReview={() => setShowSecurityModal(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
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
          />
        )}

        {/* PASSO 1: FICHA COMPLETA SEMA-MT */}
        {activeStep === 1 && (
          <OfficialInspectionSheetStep
            data={currentInspection}
            onChange={setCurrentInspection}
            onNext={() => setActiveStep(2)}
            onPrev={() => setActiveStep(0)}
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
          />
        )}
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
    </div>
  );
}
