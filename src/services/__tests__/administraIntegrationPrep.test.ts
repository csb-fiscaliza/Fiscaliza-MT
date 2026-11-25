import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyMasterSelectionToInspection,
  applyVistoriaSuperiorityUpdates,
  fetchAdministraMasterCatalog,
  loadLocalAdministraCatalog,
  loadLocalAlterationRequests,
  loadLocalAnalystInbox,
  loadLocalEcosystemProducts,
  upsertMasterEntitiesFromInspection
} from '../administraEcosystemService.ts';
import {
  ensureEcosystemClientsSession,
  syncEcosystemAuthSession
} from '../ecosystemConfig.ts';
import {
  concluirSolicitacaoVistoria,
  fetchSolicitacoesVistoria
} from '../solicitacoesVistoriaService.ts';
import {
  createEmptyInspection,
  getAllInspections,
  saveInspection
} from '../storage.ts';
import {
  convertInspectionDataToAggregate,
  getInspectorSession,
  signInInspector
} from '../supabase.ts';
import type {
  BarragemEntity,
  EmpreendedorEntity,
  InspectionData,
  ResponsavelTecnicoEntity
} from '../../types/inspection.ts';

function installMockBrowserStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const events: Array<{ type: string; detail?: unknown }> = [];

  const localStorageMock = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };

  class MockCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }

  (globalThis as any).localStorage = localStorageMock;
  (globalThis as any).CustomEvent = MockCustomEvent;
  (globalThis as any).window = {
    localStorage: localStorageMock,
    crypto: globalThis.crypto,
    dispatchEvent(evt: { type: string; detail?: unknown }) {
      events.push({ type: evt.type, detail: evt.detail });
      return true;
    }
  };

  return { store, events };
}

function cleanupMockBrowserStorage() {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  delete (globalThis as any).CustomEvent;
}

function buildSeededInspection(overrides: Partial<InspectionData> = {}): InspectionData {
  const base = createEmptyInspection({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'fiscal@sema.mt.gov.br',
    fullName: 'Fiscal Teste',
    cargo: 'Analista'
  });

  return {
    ...base,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    barragemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    empreendedorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    responsavelTecnicoId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    sistemaOrigem: 'administra',
    empreendedorOrigemSistema: 'administra',
    barragemOrigemSistema: 'administra',
    responsavelTecnicoOrigemSistema: 'administra',
    isDraft: false,
    tipoPlanejamento: 'atual',
    administraCadastroStatus: {
      empreendedor: {
        cadastrado: true,
        modo: 'vinculado_existente',
        entidadeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        sistemaOrigem: 'administra'
      },
      barragem: {
        cadastrado: true,
        modo: 'vinculado_existente',
        entidadeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sistemaOrigem: 'administra'
      },
      responsavelTecnico: {
        cadastrado: true,
        modo: 'vinculado_existente',
        entidadeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        sistemaOrigem: 'administra'
      }
    },
    generalInfo: {
      ...base.generalInfo,
      tipoPlanejamento: 'atual',
      numeroVistoria: '0042/2026',
      inspectionDate: '2026-11-20'
    },
    damIdentification: {
      ...base.damIdentification,
      damName: 'Barragem Norte',
      propertyOrBusinessName: 'Agropecuária Norte Ltda',
      ownerCpfCnpj: '11.222.333/0001-44',
      ownerLegalType: 'empresa_privada',
      ownerPhone: '(65) 99999-1111',
      ownerAddress: 'Rodovia MT-100, Km 12',
      damsCountOnProperty: '2',
      workStartYear: '2018',
      workEndYear: '2019',
      municipality: 'Sinop',
      hydrographicBasin: 'Teles Pires',
      waterCourse: 'Ribeirão Claro',
      damType: 'terra_homogenea',
      mainWaterUse: 'Irrigação',
      estimatedDimensions: {
        ...base.damIdentification.estimatedDimensions,
        heightMeters: '14.5',
        crestLengthMeters: '120'
      }
    },
    responsavelTecnico: {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      nome: 'Eng. Marcos Silva',
      cpf: '123.456.789-00',
      registroProfissional: 'CREA-MT 12345',
      artNumero: 'ART-9988',
      especialidade: 'Engenharia Civil',
      telefone: '(65) 98888-7777',
      email: 'marcos@eng.mt.gov.br',
      sistemaOrigem: 'administra'
    },
    ...overrides
  };
}

test('desativa syncEcosystemAuthSession, ensureEcosystemClientsSession e escritas externas no Supabase', async () => {
  installMockBrowserStorage();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  (globalThis as any).fetch = async () => {
    fetchCalls++;
    throw new Error('fetch nao deve ser chamado');
  };

  try {
    await syncEcosystemAuthSession('fiscal@sema.mt.gov.br', '__TEST_DUMMY_PWD_Aa1!');
    await ensureEcosystemClientsSession();
    assert.equal(fetchCalls, 0);

    let syncEcoCalls = 0;
    let ensureEcoCalls = 0;

    const mockClient = {
      auth: {
        async signInWithPassword() {
          return {
            data: {
              user: { id: 'u-1', email: 'fiscal@sema.mt.gov.br' },
              session: { access_token: 'tok-1', user: { id: 'u-1', email: 'fiscal@sema.mt.gov.br' } }
            },
            error: null
          };
        },
        async getSession() {
          return {
            data: {
              session: { access_token: 'tok-1', user: { id: 'u-1', email: 'fiscal@sema.mt.gov.br' } }
            },
            error: null
          };
        },
        async getUser() {
          return {
            data: { user: { id: 'u-1', email: 'fiscal@sema.mt.gov.br' } },
            error: null
          };
        },
        async signOut() {
          return { error: null };
        }
      },
      from(table: string) {
        assert.equal(table, 'perfis_usuarios');
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        id: 'u-1',
                        email: 'fiscal@sema.mt.gov.br',
                        nome: 'Fiscal Teste',
                        perfil: 'analista',
                        status: 'ativo'
                      },
                      error: null
                    };
                  }
                };
              }
            };
          }
        };
      }
    } as unknown as SupabaseClient;

    const signInRes = await signInInspector('fiscal@sema.mt.gov.br', '__TEST_DUMMY_PWD_Aa1!', {
      client: mockClient,
      syncEcosystem: async () => {
        syncEcoCalls++;
      }
    });
    assert.equal(signInRes.success, true);
    assert.equal(syncEcoCalls, 0);

    const sessionRes = await getInspectorSession({
      client: mockClient,
      ensureEcosystemSession: async () => {
        ensureEcoCalls++;
      }
    });
    assert.equal(sessionRes.authenticated, true);
    assert.equal(ensureEcoCalls, 0);

    // Verifica que saveInspection mantém rascunho apenas local sem acionar upsert mestre ou pedidos de alteração
    const draft = buildSeededInspection({ isDraft: true });
    saveInspection(draft);
    assert.equal(getAllInspections().length, 1);
    assert.equal(loadLocalEcosystemProducts().length >= 1, true);
    assert.equal(loadLocalAlterationRequests().length, 0);
    assert.equal(loadLocalAnalystInbox().length, 0);

    // Garante estaticamente que não há dependência do Supabase do Administra nem escritas diretas externas
    const ecoConfigSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/ecosystemConfig.ts'),
      'utf8'
    );
    assert.equal(
      /administraSupabase|VITE_ADMINISTRA_SUPABASE_|isAdministraSupabaseConfigured/.test(ecoConfigSrc),
      false
    );

    const ecoServiceSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/administraEcosystemService.ts'),
      'utf8'
    );
    assert.equal(/administraSupabase|VITE_ADMINISTRA_SUPABASE_/.test(ecoServiceSrc), false);
    assert.equal(
      /(classificaSupabase|notificaSupabase)\s*[\.\?]*\s*(from|rpc|auth\.signIn|auth\.setSession)/.test(
        ecoServiceSrc
      ) &&
        /(classificaSupabase|notificaSupabase)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(
          ecoServiceSrc
        ),
      false
    );
    assert.equal(ecoServiceSrc.includes('ensureEcosystemClientsSession'), false);

    const storageSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storage.ts'), 'utf8');
    assert.equal(storageSrc.includes('upsertMasterEntitiesFromInspection'), false);
    assert.match(storageSrc, /registerFiscalizaProductsFromInspection\(updated,\s*\{\s*syncRemote:\s*false\s*\}\)/);
  } finally {
    globalThis.fetch = originalFetch;
    cleanupMockBrowserStorage();
  }
});

test('applyVistoriaSuperiorityUpdates restringe atualizações à Vistoria Atual concluída e somente ao campo autorizado waterCourse', async () => {
  installMockBrowserStorage();

  try {
    const empId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const barId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const rtId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    const seedEmp: EmpreendedorEntity = {
      id: empId,
      administraId: empId,
      sistemaOrigem: 'administra',
      nomeRazaoSocial: 'Empreendedor Original',
      cpfCnpj: '11.222.333/0001-44',
      figuraJuridica: 'empresa_privada',
      endereco: 'Endereço Original',
      telefone: '(65) 3333-0000',
      carNumero: 'MT-ORIG-001',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const seedBar: BarragemEntity = {
      id: barId,
      administraId: barId,
      sistemaOrigem: 'administra',
      empreendedorId: empId,
      nome: 'Barragem Original',
      municipio: 'Sinop',
      baciaHidrografica: 'Teles Pires',
      cursoDagua: 'Córrego Antigo',
      coordenadas: {
        latitude: -11.86,
        longitude: -55.5,
        horarioCaptura: null,
        acuraciaMetros: null,
        altitudeEstimadaDispositivo: null,
        editadoManualmente: true,
        datum: 'SIRGAS 2000'
      },
      cotaCoroamentoMetros: 340,
      anoInicioObra: 2015,
      anoFinalObra: 2016,
      tipoMaterial: 'terra_homogenea',
      usoPrincipal: 'Irrigação',
      usosSecundarios: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const seedRt: ResponsavelTecnicoEntity = {
      id: rtId,
      administraId: rtId,
      sistemaOrigem: 'administra',
      empreendedorId: empId,
      barragemId: barId,
      nome: 'RT Original',
      cpf: '999.888.777-66',
      artNumero: 'ART-ORIG',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    localStorage.setItem(
      'fiscaliza_csb_administra_cache_v1',
      JSON.stringify({
        empreendedores: [seedEmp],
        barragens: [seedBar],
        responsaveisTecnicos: [seedRt],
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
    );

    const makeImportedInspection = (overrides: Partial<InspectionData> = {}): InspectionData => {
      const base = buildSeededInspection();
      const linked = applyMasterSelectionToInspection(base, {
        empreendedor: seedEmp,
        barragem: seedBar,
        responsavelTecnico: seedRt
      });
      return {
        ...linked,
        ...overrides,
        damIdentification: {
          ...linked.damIdentification,
          ...(overrides.damIdentification || {}),
          regulatoryStatus: {
            ...linked.damIdentification.regulatoryStatus,
            ...(overrides.damIdentification?.regulatoryStatus || {})
          }
        },
        responsavelTecnico: {
          ...linked.responsavelTecnico!,
          ...(overrides.responsavelTecnico || {})
        }
      };
    };

    // 1. Rascunho e Vistoria Futura nunca aplicam superioridade
    const draftInsp = makeImportedInspection({
      isDraft: true,
      damIdentification: { ...buildSeededInspection().damIdentification, waterCourse: 'Córrego Novo' }
    });
    const draftRes = await applyVistoriaSuperiorityUpdates(draftInsp, 'fiscal@sema.mt.gov.br', 'Fiscal');
    assert.equal(draftRes.updatedCount, 0);
    assert.equal(loadLocalAdministraCatalog().barragens[0].cursoDagua, 'Córrego Antigo');

    const futureInsp = makeImportedInspection({
      isDraft: false,
      tipoPlanejamento: 'futura',
      damIdentification: { ...buildSeededInspection().damIdentification, waterCourse: 'Córrego Novo' }
    });
    const futureRes = await applyVistoriaSuperiorityUpdates(futureInsp, 'fiscal@sema.mt.gov.br', 'Fiscal');
    assert.equal(futureRes.updatedCount, 0);
    assert.equal(loadLocalAdministraCatalog().barragens[0].cursoDagua, 'Córrego Antigo');

    // 2. Campos fora do escopo autorizado (empreendedor, RT e cadastrais da barragem) nunca sobrescrevem
    const outOfScopeInsp = makeImportedInspection({
      isDraft: false,
      tipoPlanejamento: 'atual',
      damIdentification: {
        ...buildSeededInspection().damIdentification,
        damName: 'Nome Alterado Indevido',
        municipality: 'Cuiabá',
        workStartYear: '2024',
        workEndYear: '2025',
        propertyOrBusinessName: 'Outro Empreendedor',
        ownerCpfCnpj: '00.111.222/0001-33',
        waterCourse: 'Córrego Antigo',
        regulatoryStatus: {
          ...buildSeededInspection().damIdentification.regulatoryStatus,
          carNumber: 'MT-NOVO-999'
        }
      },
      responsavelTecnico: {
        id: rtId,
        nome: 'Outro RT',
        cpf: '111.222.333-44',
        artNumero: 'ART-OUTRA'
      }
    });
    const outOfScopeRes = await applyVistoriaSuperiorityUpdates(
      outOfScopeInsp,
      'fiscal@sema.mt.gov.br',
      'Fiscal'
    );
    assert.equal(outOfScopeRes.updatedCount, 0);
    const catalogAfterOutOfScope = loadLocalAdministraCatalog();
    assert.equal(catalogAfterOutOfScope.barragens[0].nome, 'Barragem Original');
    assert.equal(catalogAfterOutOfScope.barragens[0].municipio, 'Sinop');
    assert.equal(catalogAfterOutOfScope.empreendedores[0].nomeRazaoSocial, 'Empreendedor Original');
    assert.equal(catalogAfterOutOfScope.responsaveisTecnicos[0].nome, 'RT Original');

    // 3. Valor vazio ou entidadeId divergente para waterCourse não sobrescreve
    const blankWaterCourse = makeImportedInspection({
      isDraft: false,
      tipoPlanejamento: 'atual',
      damIdentification: {
        ...buildSeededInspection().damIdentification,
        waterCourse: '   '
      }
    });
    assert.equal(
      (await applyVistoriaSuperiorityUpdates(blankWaterCourse, 'fiscal@sema.mt.gov.br', 'Fiscal')).updatedCount,
      0
    );

    // 4. Vistoria Atual concluída com alteração aferida em waterCourse aplica apenas cursoDagua
    const validInsp = makeImportedInspection({
      isDraft: false,
      tipoPlanejamento: 'atual',
      damIdentification: {
        ...buildSeededInspection().damIdentification,
        damName: 'Nome Ignorado',
        municipality: 'Sorriso',
        propertyOrBusinessName: 'Empresa Ignorada',
        waterCourse: 'Córrego Conferido em Campo'
      }
    });
    const okRes = await applyVistoriaSuperiorityUpdates(validInsp, 'fiscal@sema.mt.gov.br', 'Fiscal');
    assert.equal(okRes.updatedCount, 1);
    assert.equal(okRes.notificationsSent.length, 1);
    assert.equal(okRes.notificationsSent[0].campoAlterado, 'waterCourse');

    const catalogAfterOk = loadLocalAdministraCatalog();
    assert.equal(catalogAfterOk.barragens[0].cursoDagua, 'Córrego Conferido em Campo');
    assert.equal(catalogAfterOk.barragens[0].nome, 'Barragem Original');
    assert.equal(catalogAfterOk.barragens[0].municipio, 'Sinop');
    assert.equal(catalogAfterOk.barragens[0].cotaCoroamentoMetros, 340);
    assert.equal(catalogAfterOk.empreendedores[0].nomeRazaoSocial, 'Empreendedor Original');

    // Registro de auditoria local não declara alteração aplicada no sistema de origem externo
    const auditReqs = loadLocalAlterationRequests();
    assert.equal(auditReqs.length, 1);
    assert.equal(auditReqs[0].status, 'pendente');

    // Reexecução idempotente com o mesmo valor não duplica notificação
    const repeatRes = await applyVistoriaSuperiorityUpdates(validInsp, 'fiscal@sema.mt.gov.br', 'Fiscal');
    assert.equal(repeatRes.updatedCount, 0);
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('mantém heightMeters separado de cotaCoroamentoMetros e cota_coroamento_metros', () => {
  installMockBrowserStorage();

  try {
    const insp = buildSeededInspection();
    insp.damIdentification.estimatedDimensions.heightMeters = '18.75';

    const agg = convertInspectionDataToAggregate(insp);
    assert.equal(agg.medicoes.alturaBarragemMetros, 18.75);
    assert.equal(agg.barragem.cotaCoroamentoMetros, null);

    // Preserva zero numérico sem misturar campos
    const inspZero = buildSeededInspection();
    inspZero.damIdentification.estimatedDimensions.heightMeters = '0';
    const aggZero = convertInspectionDataToAggregate(inspZero);
    assert.equal(aggZero.medicoes.alturaBarragemMetros, 0);
    assert.equal(aggZero.barragem.cotaCoroamentoMetros, null);

    const ecoServiceSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/administraEcosystemService.ts'),
      'utf8'
    );
    assert.match(ecoServiceSrc, /cotaCoroamentoMetros:\s*pickFirstNumber\(row,\s*\['cota_coroamento_metros'\]\)/);
    assert.match(ecoServiceSrc, /cotaCoroamentoMetros:\s*toNullableNum\(dto\.cotaCoroamentoMetros\)/);
    assert.equal(ecoServiceSrc.includes('heightMeters'), false);
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('preserva valores existentes e dados digitados em indisponibilidade, erros e dados incompletos', async () => {
  installMockBrowserStorage();

  try {
    // 1. applyMasterSelectionToInspection com registros incompletos preserva dados já digitados
    const prev = buildSeededInspection();
    prev.damIdentification.ownerCpfCnpj = '11.222.333/0001-44';
    prev.damIdentification.ownerPhone = '(65) 99999-1111';
    prev.damIdentification.ownerAddress = 'Rua Já Digitada, 50';
    prev.damIdentification.hydrographicBasin = 'Alto Paraguai';
    prev.damIdentification.waterCourse = 'Rio Quebo';
    prev.damIdentification.workStartYear = '2017';
    prev.responsavelTecnico = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      nome: 'Eng. Digitado',
      cpf: '555.666.777-88',
      registroProfissional: 'CREA-MT 555',
      artNumero: 'ART-777',
      telefone: '(65) 97777-6666',
      email: 'rt@digitado.mt.gov.br',
      sistemaOrigem: 'fiscaliza'
    };

    const incompleteEmp: EmpreendedorEntity = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      administraId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sistemaOrigem: 'administra',
      nomeRazaoSocial: 'Agropecuária Atualizada',
      cpfCnpj: null,
      figuraJuridica: '',
      endereco: '',
      telefone: null,
      email: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const incompleteBar: BarragemEntity = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      administraId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sistemaOrigem: 'administra',
      empreendedorId: incompleteEmp.id,
      nome: 'Barragem Norte',
      municipio: '',
      baciaHidrografica: null,
      cursoDagua: null,
      coordenadas: {
        latitude: null,
        longitude: null,
        horarioCaptura: null,
        acuraciaMetros: null,
        altitudeEstimadaDispositivo: null,
        editadoManualmente: false,
        datum: 'SIRGAS 2000'
      },
      cotaCoroamentoMetros: null,
      anoInicioObra: null,
      anoFinalObra: null,
      tipoMaterial: '',
      usoPrincipal: '',
      usosSecundarios: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const incompleteRt: ResponsavelTecnicoEntity = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      administraId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      sistemaOrigem: 'administra',
      nome: '',
      cpf: null,
      registroProfissional: null,
      artNumero: null,
      telefone: null,
      email: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const merged = applyMasterSelectionToInspection(prev, {
      empreendedor: incompleteEmp,
      barragem: incompleteBar,
      responsavelTecnico: incompleteRt
    });

    assert.equal(merged.damIdentification.propertyOrBusinessName, 'Agropecuária Atualizada');
    assert.equal(merged.damIdentification.ownerCpfCnpj, '11.222.333/0001-44');
    assert.equal(merged.damIdentification.ownerPhone, '(65) 99999-1111');
    assert.equal(merged.damIdentification.ownerAddress, 'Rua Já Digitada, 50');
    assert.equal(merged.damIdentification.municipality, 'Sinop');
    assert.equal(merged.damIdentification.hydrographicBasin, 'Alto Paraguai');
    assert.equal(merged.damIdentification.waterCourse, 'Rio Quebo');
    assert.equal(merged.damIdentification.workStartYear, '2017');
    assert.equal(merged.responsavelTecnico?.nome, 'Eng. Digitado');
    assert.equal(merged.responsavelTecnico?.cpf, '555.666.777-88');
    assert.equal(merged.responsavelTecnico?.artNumero, 'ART-777');

    // 2. Indisponibilidade de nós externos preserva catálogo local e não quebra upsert mestre
    localStorage.setItem(
      'fiscaliza_csb_administra_cache_v1',
      JSON.stringify({
        empreendedores: [incompleteEmp],
        barragens: [incompleteBar],
        responsaveisTecnicos: [incompleteRt],
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
    );

    const catalog = await fetchAdministraMasterCatalog(['Barragem Norte']);
    assert.equal(catalog.barragens.length, 1);
    assert.equal(catalog.barragens[0].id, incompleteBar.id);

    const upsertRes = await upsertMasterEntitiesFromInspection(merged, 'fiscal@sema.mt.gov.br');
    assert.equal(upsertRes.savedToAdministraRemote, false);

    // 3. Serviços de Solicitação de Vistoria retornam falha controlada sem exceção quando sem sessão/token
    const listFail = await fetchSolicitacoesVistoria();
    assert.equal(listFail.success, false);
    assert.equal(typeof listFail.error, 'string');

    const conclFail = await concluirSolicitacaoVistoria('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', {
      vistoria_id: merged.id,
      data_realizacao: '2026-11-20',
      equipe: [],
      observacao_campo: 'Obs preservada'
    });
    assert.equal(conclFail.success, false);
    assert.equal(typeof conclFail.error, 'string');

    // 4. SolicitacoesVistoriaStep preserva lista já carregada em falha de atualização
    const solicitacoesStepSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/SolicitacoesVistoriaStep.tsx'),
      'utf8'
    );
    assert.match(solicitacoesStepSrc, /if\s*\(solicitacoesCountRef\.current\s*>\s*0\)/);
  } finally {
    cleanupMockBrowserStorage();
  }
});
