// ==============================================================================
// ARQUIVO: src/components/LoginPage.tsx
// Página Institucional de Autenticação Segura - Fiscaliza CSB / SEMA-MT
// Controle de Acesso Restrito a Fiscais de Segurança de Barragens
// Proteção de dados sem exposição de credenciais ou informações sensíveis
// ==============================================================================

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  UserCheck, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  KeyRound, 
  WifiOff, 
  HelpCircle,
  Building2,
  FileCheck2
} from 'lucide-react';
import { FiscalizaLogo } from './FiscalizaLogo';
import { signInInspector, signUpInspector } from '../services/supabase';

interface LoginPageProps {
  onLoginSuccess: (session: { email?: string; fullName?: string; role?: string }) => void;
  isOnline: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, isOnline }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setFeedback({ type: 'error', text: 'Por favor, informe seu e-mail institucional.' });
      return;
    }

    if (mode === 'login' && !password) {
      setFeedback({ type: 'error', text: 'Por favor, informe sua senha de acesso.' });
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      if (mode === 'login') {
        const res = await signInInspector(email, password);
        if (res.success) {
          setFeedback({ type: 'success', text: 'Autenticação confirmada. Carregando sistema...' });
          setTimeout(() => {
            onLoginSuccess({
              email: res.email || email,
              fullName: res.fullName,
              role: 'Fiscal Técnico CSB'
            });
          }, 400);
        } else {
          setFeedback({ 
            type: 'error', 
            text: res.error || 'Credenciais inválidas. Verifique seu e-mail e senha.' 
          });
        }
      } else {
        // Cadastro de Novo Fiscal
        // Senha padrão institucional aplicada se não digitada pelo usuário
        const res = await signUpInspector(email, password, fullName);
        if (res.success) {
          setFeedback({ 
            type: 'success', 
            text: res.message || 'Cadastro realizado com sucesso! Você já pode acessar o sistema.' 
          });
          // Alterna para tela de login após cadastro
          setTimeout(() => {
            setMode('login');
          }, 1500);
        } else {
          setFeedback({ 
            type: 'error', 
            text: res.error || 'Falha ao processar o cadastro do fiscal.' 
          });
        }
      }
    } catch (err: any) {
      setFeedback({ 
        type: 'error', 
        text: err.message || 'Ocorreu um erro inesperado na comunicação de segurança.' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white font-sans">
      {/* Barra de Notificação Superior Offline */}
      {!isOnline && (
        <div className="bg-amber-600/90 text-amber-50 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 border-b border-amber-500/50">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Dispositivo em modo campo (sem internet). A autenticação operará em contingência segura local.</span>
        </div>
      )}

      {/* Conteúdo Central */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md bg-white dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-md transition-all">
          
          {/* Topo Institucional do Cartão */}
          <div className="p-6 sm:p-8 bg-linear-to-b from-emerald-950/20 to-transparent border-b border-slate-100 dark:border-slate-800/80 text-center">
            <div className="inline-block p-2 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-200/60 dark:border-slate-700/60 mb-3.5">
              <FiscalizaLogo size="lg" />
            </div>

            <div className="flex items-center justify-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Fiscaliza MT
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                CSB / SEMA-MT
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Superintendência de Recursos Hídricos (SURH) · Governo de Mato Grosso
            </p>
          </div>

          {/* Abas: Entrar vs Cadastrar Novo Fiscal */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-1.5 gap-1.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setFeedback(null);
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Acesso ao Sistema</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('register');
                setFeedback(null);
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Novo Fiscal</span>
            </button>
          </div>

          {/* Formulário de Autenticação */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
            {/* Mensagem de Feedback */}
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 border animate-in fade-in duration-200 ${
                  feedback.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                    : feedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                }`}
              >
                {feedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            {/* Campo Nome (Apenas Cadastro) */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo do Fiscal *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="ex: Dr(a). Fiscal Técnico"
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all"
                  />
                </div>
              </div>
            )}

            {/* Campo E-mail */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                E-mail Institucional *
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="fiscal@sema.mt.gov.br"
                  className="w-full text-xs sm:text-sm pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {mode === 'login' ? 'Senha de Acesso *' : 'Senha Inicial (Opcional)'}
                </label>
                {mode === 'register' && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Padrão institucional aplicado
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required={mode === 'login'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'login' ? '••••••••' : 'Deixe em branco para senha padrão'}
                  className="w-full text-xs sm:text-sm pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Todo novo usuário criado terá a senha padrão institucional, podendo alterá-la imediatamente após acessar o sistema.
                </p>
              )}
            </div>

            {/* Botão de Envio */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : mode === 'login' ? (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Criar Cadastro de Fiscal</span>
                  <UserCheck className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Rodapé de Segurança e Proteção */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 space-y-1 text-center">
            <div className="flex items-center justify-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Ambiente Protegido e Auditado pela CSB/SEMA-MT</span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Criptografia AES-GCM 256-bit ponta a ponta · Selo de Autenticidade SHA-256
            </p>
          </div>
        </div>
      </div>

      {/* Rodapé Institucional Inferior da Página */}
      <footer className="py-4 px-6 text-center text-xs text-slate-500 border-t border-slate-800/60 bg-slate-950/60">
        <p className="font-semibold text-slate-400">
          Governo do Estado de Mato Grosso · Secretaria de Estado de Meio Ambiente (SEMA-MT)
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Coordenadoria de Segurança de Barragens – Usos Múltiplos (CSB) · Sistema Oficial de Fiscalização de Campo
        </p>
      </footer>
    </div>
  );
};
