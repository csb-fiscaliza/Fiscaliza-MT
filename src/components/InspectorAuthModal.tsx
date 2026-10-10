import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  X, 
  Lock, 
  UserCheck, 
  KeyRound, 
  Mail, 
  Database, 
  Copy, 
  Check, 
  AlertCircle, 
  RefreshCw,
  LogOut,
  Terminal,
  Server
} from 'lucide-react';
import { 
  signInInspector, 
  signUpInspector, 
  signOutInspector, 
  getInspectorSession,
  ensureAuthenticatedSession
} from '../services/supabase';

interface InspectorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: () => void;
}

export const InspectorAuthModal: React.FC<InspectorAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'sql'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [currentSession, setCurrentSession] = useState<{ authenticated: boolean; email?: string; role?: string }>({
    authenticated: false
  });
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkSession();
      setStatusMsg(null);
    }
  }, [isOpen]);

  const checkSession = async () => {
    const session = await getInspectorSession();
    setCurrentSession(session);
  };

  if (!isOpen) return null;

  const handleLoginOrRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setStatusMsg({ type: 'error', text: 'Preencha o e-mail e a senha do fiscal.' });
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      if (isSignUp) {
        const res = await signUpInspector(email, password, fullName);
        if (res.success) {
          setStatusMsg({ type: 'success', text: res.message || 'Cadastro realizado com sucesso!' });
          await checkSession();
          if (onAuthSuccess) onAuthSuccess();
        } else {
          setStatusMsg({ type: 'error', text: res.error || 'Falha no cadastro institucional.' });
        }
      } else {
        const res = await signInInspector(email, password);
        if (res.success) {
          setStatusMsg({ type: 'success', text: 'Fiscal autenticado com sucesso! Sincronização liberada.' });
          await checkSession();
          if (onAuthSuccess) {
            setTimeout(() => {
              onAuthSuccess();
              onClose();
            }, 800);
          }
        } else {
          setStatusMsg({ type: 'error', text: res.error || 'Credenciais inválidas.' });
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Erro inesperado na autenticação.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTryAnonAuth = async () => {
    setLoading(true);
    setStatusMsg({ type: 'info', text: 'Verificando autorização automática de campo...' });
    try {
      const res = await ensureAuthenticatedSession();
      if (res.authenticated) {
        setStatusMsg({ type: 'success', text: 'Acesso automático de campo estabelecido com sucesso!' });
        await checkSession();
        if (onAuthSuccess) onAuthSuccess();
      } else {
        setStatusMsg({ 
          type: 'error', 
          text: 'O banco de dados requer e-mail/senha cadastrado ou a execução do script SQL de liberação das regras RLS.' 
        });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Não foi possível estabelecer sessão anônima.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    await signOutInspector();
    await checkSession();
    setStatusMsg({ type: 'info', text: 'Sessão encerrada com sucesso.' });
    setLoading(false);
  };

  const sqlScript = `-- SCRIPT DE LIBERAÇÃO RLS PARA COLETA DE CAMPO (SEMA-MT / FISCALIZA CSB)
-- Execute este script no SQL Editor do Supabase para autorizar o envio de vistorias:

CREATE POLICY "Fiscaliza CSB: Empreendedores" ON empreendedores FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Barragens" ON barragens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Vistorias" ON vistorias FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Equipe" ON vistoria_equipe FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Acompanhantes" ON vistoria_acompanhantes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Medições" ON vistoria_medicoes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Condição Componentes" ON vistoria_componentes_condicao FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Itens Avaliados" ON vistoria_itens_avaliados FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Observações" ON vistoria_observacoes_componentes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Fotos" ON vistoria_fotos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Documentos" ON vistoria_documentos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fiscaliza CSB: Auditoria" ON vistoria_historico_alteracoes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Top Header */}
        <div className="bg-slate-900 text-white px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-700/80 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                <span>Acesso Seguro de Fiscal & Sincronização</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-mono font-normal">
                  SEMA-MT
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Resolução de permissões RLS (Código 42501) e autenticação de campo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informação de Segurança Local */}
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900/40 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-[11px] leading-relaxed">
            <strong>Seus dados estão protegidos:</strong> Todas as vistorias permanecem salvas e criptografadas localmente no aparelho, garantindo que nada seja perdido no campo.
          </p>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-t border-x ${
              activeTab === 'login'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Autenticação do Fiscal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-t border-x ${
              activeTab === 'sql'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Desbloquear RLS (Script SQL)</span>
          </button>
        </div>

        {/* Mensagens de Feedback */}
        {statusMsg && (
          <div className={`mx-4 mt-4 p-3 rounded-xl border text-xs flex items-start gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : statusMsg.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200'
          }`}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1 leading-snug">{statusMsg.text}</span>
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-y-auto max-h-[60vh] space-y-4">
          {activeTab === 'login' ? (
            <div className="space-y-4">
              {/* Sessão Ativa */}
              {currentSession.authenticated ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold text-emerald-900 dark:text-emerald-300">
                        Sessão Institucional Ativa
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                      {currentSession.role || 'Fiscal'}
                    </span>
                  </div>

                  <p className="text-slate-700 dark:text-slate-300 text-xs">
                    Fiscal conectado: <strong className="font-mono">{currentSession.email || 'Usuário Autenticado'}</strong>
                  </p>

                  <div className="flex items-center gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-800/60">
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Desconectar Fiscal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onAuthSuccess) onAuthSuccess();
                        onClose();
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Sincronizar Vistorias Agora</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleLoginOrRegister} className="space-y-3.5">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    O banco de dados centralizado possui controle de acesso por linha (RLS). Faça login para transmitir suas vistorias de forma oficial:
                  </p>

                  {isSignUp && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nome Completo do Fiscal
                      </label>
                      <div className="relative">
                        <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Ex: Carlos Silva"
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      E-mail Institucional ou de Acesso
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="fiscal@sema.mt.gov.br"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Senha
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Autenticando...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>{isSignUp ? 'Cadastrar e Conectar' : 'Acessar como Fiscal'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 hover:text-emerald-700 font-semibold cursor-pointer underline"
                    >
                      {isSignUp ? 'Já tenho conta' : 'Criar acesso'}
                    </button>
                  </div>

                  {/* Opção de login anônimo rápido */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center">
                    <button
                      type="button"
                      onClick={handleTryAnonAuth}
                      disabled={loading}
                      className="text-[11px] text-slate-500 hover:text-emerald-600 dark:text-slate-400 font-medium flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>Testar Conexão Anônima Automática</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <p>
                  O erro <strong>42501 (Row-Level Security)</strong> ocorre porque as tabelas do banco possuem RLS ativado e restrito apenas a usuários logados.
                </p>
                <p>
                  Para permitir que o app sincronize tanto em modo anônimo quanto autenticado sem exigir senhas de todos os fiscais no campo, execute o seguinte comando no <strong>SQL Editor</strong> do seu banco:
                </p>
              </div>

              {/* Bloco de Código SQL */}
              <div className="relative">
                <div className="bg-slate-950 text-slate-200 p-3 rounded-xl font-mono text-[11px] overflow-x-auto border border-slate-800 leading-relaxed max-h-56">
                  <pre>{sqlScript}</pre>
                </div>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3 h-3 text-emerald-200" /> : <Copy className="w-3 h-3 text-emerald-200" />}
                  <span>{copiedSql ? 'Copiado!' : 'Copiar SQL'}</span>
                </button>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Passo a passo no Painel:</span>
                </div>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Abra o SQL Editor do seu projeto Supabase.</li>
                  <li>Cole as instruções acima e clique em <strong>Run</strong>.</li>
                  <li>Pronto! Volte ao app e clique no botão de sincronizar.</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 dark:bg-slate-950 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono">
            Proteção AES-GCM 256-bit + RLS Policy
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
