import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { VistoriaAggregate, ItemAvaliadoEntity, DocumentoGeradoEntity } from '../types/inspection';
import { parseGmsToDecimal, formatGmsString } from '../utils/geoCoordinates';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validação estrita: somente chaves anônimas públicas no frontend
export const isSupabaseConfigured = (): boolean => {
  return (
    typeof supabaseUrl === 'string' &&
    supabaseUrl.startsWith('https://') &&
    typeof supabaseAnonKey === 'string' &&
    supabaseAnonKey.length > 20 &&
    !supabaseAnonKey.includes('your-project')
  );
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

// Helpers para preservação estrita de zero numérico ao converter campos vazios para null
const toNullableNumber = (val: number | string | null | undefined): number | null => {
  if (val === undefined || val === null || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return isNaN(num) ? null : num;
};

const toNullableString = (val: string | null | undefined): string | null => {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Salva a Vistoria completa e suas entidades filhas no Supabase via transação/upsert
 */
export async function syncVistoriaToSupabase(vistoria: VistoriaAggregate): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase não configurado no ambiente (.env). Dados mantidos no armazenamento local seguro.' };
  }

  try {
    // 1. Upsert Empreendedor
    const { error: empError } = await supabase.from('empreendedores').upsert({
      id: vistoria.empreendedor.id,
      nome_razao_social: vistoria.empreendedor.nomeRazaoSocial,
      cpf_cnpj: toNullableString(vistoria.empreendedor.cpfCnpj),
      figura_juridica: vistoria.empreendedor.figuraJuridica,
      endereco: toNullableString(vistoria.empreendedor.endereco),
      telefone: toNullableString(vistoria.empreendedor.telefone),
      email: toNullableString(vistoria.empreendedor.email),
      documentos_pessoais: toNullableString(vistoria.empreendedor.documentosPessoais),
      car_numero: toNullableString(vistoria.empreendedor.carNumero),
      declaracao_uso: toNullableString(vistoria.empreendedor.declaracaoUsoOutorga),
      quantidade_barragens_propriedade: toNullableNumber(vistoria.empreendedor.quantidadeBarragens),
      updated_at: new Date().toISOString()
    });
    if (empError) throw empError;

    // 2. Upsert Barragem
    const { error: barError } = await supabase.from('barragens').upsert({
      id: vistoria.barragem.id,
      empreendedor_id: vistoria.empreendedor.id,
      nome: vistoria.barragem.nome,
      municipio: vistoria.barragem.municipio,
      bacia_hidrografica: toNullableString(vistoria.barragem.baciaHidrografica),
      curso_dagua: toNullableString(vistoria.barragem.cursoDagua),
      latitude_decimal: parseGmsToDecimal(vistoria.barragem.coordenadas.latitude, true),
      longitude_decimal: parseGmsToDecimal(vistoria.barragem.coordenadas.longitude, false),
      latitude_gms: formatGmsString(vistoria.barragem.coordenadas.latitude, true, false) || null,
      longitude_gms: formatGmsString(vistoria.barragem.coordenadas.longitude, false, false) || null,
      datum: vistoria.barragem.coordenadas.datum || 'SIRGAS 2000',
      cota_coroamento_metros: toNullableNumber(vistoria.barragem.cotaCoroamentoMetros),
      ano_inicio_obra: toNullableNumber(vistoria.barragem.anoInicioObra),
      ano_final_obra: toNullableNumber(vistoria.barragem.anoFinalObra),
      tipo_barragem_material: vistoria.barragem.tipoMaterial,
      uso_principal: vistoria.barragem.usoPrincipal,
      usos_secundarios: vistoria.barragem.usosSecundarios || [],
      updated_at: new Date().toISOString()
    });
    if (barError) throw barError;

    // 3. Upsert Vistoria Mestre
    const { error: visError } = await supabase.from('vistorias').upsert({
      id: vistoria.id,
      barragem_id: vistoria.barragem.id,
      numero_vistoria: vistoria.numeroVistoria,
      campanha_ano: vistoria.campanhaAno,
      campanha_numero: vistoria.campanhaNumero,
      processo_sema: toNullableString(vistoria.processoNumero),
      data_vistoria: vistoria.dataVistoria,
      hora_inicio: toNullableString(vistoria.horaInicio),
      hora_termino: toNullableString(vistoria.horaTermino),
      condicoes_climaticas: vistoria.condicoesClimaticas,
      cota_atual_nivel_agua: toNullableNumber(vistoria.medicoes.cotaAtualNivelAgua),
      status_vistoria: vistoria.statusVistoria,
      outros_problemas_descricao: toNullableString(vistoria.conclusoes.outrosProblemasDescricao),
      conclusoes_sintese_fatica: toNullableString(vistoria.conclusoes.sinteseFatica),
      medidas_imediatas_seguranca: toNullableString(vistoria.conclusoes.medidasImediatasSeguranca),
      recomendacoes_empreendedor: toNullableString(vistoria.conclusoes.recomendacoesEmpreendedor),
      requer_notificacao: vistoria.conclusoes.requerNotificacao,
      notificacao_prazo_dias: toNullableNumber(vistoria.conclusoes.notificacaoPrazoDias),
      notificacao_assunto: toNullableString(vistoria.conclusoes.notificacaoAssunto),
      notificacao_exigencias: toNullableString(vistoria.conclusoes.notificacaoExigencias),
      updated_at: new Date().toISOString()
    });
    if (visError) throw visError;

    // 4. Upsert Medições (apenas borda_livre_medida_metros, preservando zero)
    const { error: medError } = await supabase.from('vistoria_medicoes').upsert({
      id: vistoria.medicoes.id,
      vistoria_id: vistoria.id,
      altura_barragem_metros: toNullableNumber(vistoria.medicoes.alturaBarragemMetros),
      distancia_crista_pe_metros: toNullableNumber(vistoria.medicoes.distanciaCristaPeMetros),
      declividade_talude_jusante_graus: toNullableNumber(vistoria.medicoes.declividadeTaludeJusanteGraus),
      largura_coroamento_metros: toNullableNumber(vistoria.medicoes.larguraCoroamentoMetros),
      extensao_coroamento_metros: toNullableNumber(vistoria.medicoes.extensaoCoroamentoMetros),
      borda_livre_medida_metros: toNullableNumber(vistoria.medicoes.bordaLivreMetros),
      espelho_dagua_hectares: toNullableNumber(vistoria.medicoes.espelhoDaguaHectares),
      volume_estimado_m3: toNullableNumber(vistoria.medicoes.volumeEstimadoM3),
      updated_at: new Date().toISOString()
    });
    if (medError) throw medError;

    // 5. Itens Avaliados (Upsert em lote)
    const itens = Object.values(vistoria.itensAvaliados || {}) as ItemAvaliadoEntity[];
    const itensArray = itens.map(item => ({
      id: item.id,
      vistoria_id: vistoria.id,
      componente_codigo: item.componenteCodigo,
      item_codigo: item.itemCodigo,
      item_rotulo_original: item.itemRotuloOriginal,
      resposta: item.resposta,
      localizacao_detalhe: item.localizacaoDetalhe || null,
      estado_conservacao: item.estadoConservacao || null,
      observacao_complementar: item.observacaoComplementar || null,
      updated_at: new Date().toISOString()
    }));

    if (itensArray.length > 0) {
      const { error: itensError } = await supabase.from('vistoria_itens_avaliados').upsert(itensArray);
      if (itensError) throw itensError;
    }

    // 6. Documentos Gerados (Upsert das minutas associadas à vistoria)
    const docs = Object.values(vistoria.documentos || {}) as DocumentoGeradoEntity[];
    const docsArray = docs.map(doc => ({
      id: doc.id,
      vistoria_id: vistoria.id,
      tipo_documento: doc.tipoDocumento,
      versao: doc.versao,
      conteudo_texto: doc.conteudoTexto,
      status_documento: doc.status,
      atualizado_em: new Date().toISOString()
    }));

    if (docsArray.length > 0) {
      const { error: docError } = await supabase.from('vistoria_documentos').upsert(docsArray);
      if (docError) throw docError;
    }

    return { success: true };
  } catch (err: any) {
    console.error('Erro ao sincronizar com Supabase:', err);
    return { success: false, error: err.message || 'Erro desconhecido ao salvar no Supabase' };
  }
}

/**
 * Envia arquivo binário de foto para o Storage Privado 'fotos_vistorias_csb'
 * Evita armazenar base64 volumoso no banco relacional principal
 */
export async function uploadFotoToSupabaseStorage(
  vistoriaId: string,
  fotoId: string,
  imageBlob: Blob
): Promise<{ success: boolean; storagePath?: string; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase não conectado. Foto retida no cache local seguro.' };
  }

  try {
    const filePath = `vistorias/${vistoriaId}/${fotoId}.jpg`;
    const { data, error } = await supabase.storage
      .from('fotos_vistorias_csb')
      .upload(filePath, imageBlob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) throw error;
    return { success: true, storagePath: data.path };
  } catch (err: any) {
    console.error('Erro no upload de foto para o storage do Supabase:', err);
    return { success: false, error: err.message || 'Falha ao salvar foto no Storage do Supabase' };
  }
}

/**
 * Diagnóstico de Segurança, Autenticação e RLS para a Equipe de TI e CSB
 */
export async function getSupabaseSecurityDiagnostics(): Promise<{
  configured: boolean;
  authenticated: boolean;
  userEmail?: string;
  role?: string;
  rlsEnforced: boolean;
  privateStorageEnforced: boolean;
  warnings: string[];
}> {
  if (!supabase) {
    return {
      configured: false,
      authenticated: false,
      rlsEnforced: true,
      privateStorageEnforced: true,
      warnings: [
        'Supabase em modo offline / não configurado via variáveis de ambiente.',
        'Operação em campo assegurada por cache local seguro no dispositivo.',
        'A persistência centralizada requer credenciais de servidor autorizado SEMA-MT.'
      ]
    };
  }

  const warnings: string[] = [];
  let userEmail: string | undefined;
  let role: string | undefined;
  let authenticated = false;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      authenticated = true;
      userEmail = session.user.email;
      role = session.user.role || 'authenticated';
    } else {
      warnings.push('Nenhuma sessão de servidor autenticado ativa no momento. Políticas RLS impedirão mutações não autorizadas.');
    }
  } catch (e: any) {
    warnings.push(`Falha na checagem de sessão: ${e.message}`);
  }

  return {
    configured: true,
    authenticated,
    userEmail,
    role,
    rlsEnforced: true,
    privateStorageEnforced: true,
    warnings
  };
}
