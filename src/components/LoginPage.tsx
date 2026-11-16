// ==============================================================================
// ARQUIVO: src/components/LoginPage.tsx
// Página Institucional de Autenticação Segura - FISCALIZA - Etapa de Campo
// Controle de Acesso Estrito sem senhas hardcoded ou credenciais expostas
// ==============================================================================

import React, { useState, useEffect } from 'react';
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
  WifiOff,
  ShieldPlus
} from 'lucide-react';
import { FiscalizaLogo } from './FiscalizaLogo';
import { signInInspector } from '../services/supabase';
import {
  bootstrapFirstAdmin,
  hasAnyAdminUser,
  requestUserAccess
} from '../services/userService';
import { validatePasswordStrength } from '../utils/securityCrypto';

interface LoginPageProps {
  onLoginSuccess: (session: { email?: string; fullName?: string; role?: string }) => void;
  isOnline: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, isOnline }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'bootstrap'>('login');
  const [hasAdmin, setHasAdmin] = useState<boolean>(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [cargo, setCargo] = useState('');
  const [matricula, setMatricula] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  useEffect(() => {
    hasAnyAdminUser()
      .then(exists => {
        setHasAdmin(exists);
        if (!exists) {
          setMode('bootstrap');
        }
      })
      .catch(() => {});
  }, []);

  const handleSwitchMode = (newMode: 'login' | 'register' | 'bootstrap') => {
    setMode(newMode);
    setFeedback(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setFeedback({ type: 'error', text: 'Por favor, informe um e-mail institucional válido.' });
      return;
    }

    if (mode === 'login' && !password) {
      setFeedback({ type: 'error', text: 'Por favor, informe sua senha de acesso.' });
      return;
    }

    if (mode === 'register' || mode === 'bootstrap') {
      if (!fullName.trim()) {
        setFeedback({ type: 'error', text: 'Por favor, preencha o seu nome completo.' });
        return;
      }
      if (!cargo.trim()) {
        setFeedback({ type: 'error', text: 'Por favor, informe o seu cargo ou função.' });
        return;
      }
      if (!matricula.trim()) {
        setFeedback({ type: 'error', text: 'Por favor, informe sua matrícula funcional.' });
        return;
      }
      const pwdCheck = validatePasswordStrength(password);
      if (!pwdCheck.valid) {
        setFeedback({ type: 'error', text: pwdCheck.reason || 'Senha não atende à política de segurança.' });
        return;
      }
      if (password !== confirmPassword) {
        setFeedback({ type: 'error', text: 'As senhas informadas não coincidem.' });
        return;
      }
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
              role: res.role || 'analista'
            });
          }, 350);
        } else {
          setFeedback({
            type: 'error',
            text: res.error || 'Credenciais inválidas. Verifique seu e-mail e senha.'
          });
        }
      } else if (mode === 'bootstrap') {
        const res = await bootstrapFirstAdmin({
          name: fullName,
          email,
          cargo,
          matricula,
          password
        });
        if (res.success && res.user) {
          await signInInspector(email, password);
          setFeedback({ type: 'success', text: 'Administrador inicial configurado com segurança!' });
          setTimeout(() => {
            onLoginSuccess({
              email: res.user!.email,
              fullName: res.user!.name,
              role: 'administrador'
            });
          }, 400);
        } else {
          setFeedback({ type: 'error', text: res.error || 'Falha na configuração do Administrador.' });
        }
      } else {
        const res = await requestUserAccess({
          name: fullName.trim(),
          email,
          cargo: cargo.trim(),
          matricula: matricula.trim(),
          password
        });
        if (res.success) {
          setFeedback({
            type: 'success',
            text:
              res.message ||
              'Solicitação de acesso enviada com sucesso! Aguarde a aprovação de um Administrador.'
          });
          setTimeout(() => {
            setMode('login');
            setPassword('');
            setConfirmPassword('');
          }, 3000);
        } else {
          setFeedback({
            type: 'error',
            text: res.error || 'Falha ao processar a solicitação de acesso.'
          });
        }
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Ocorreu um erro inesperado na autenticação.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white font-sans">
      {!isOnline && (
        <div className="bg-amber-600/90 text-amber-50 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 border-b border-amber-500/50">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Dispositivo em modo campo (sem internet). A autenticação operará em contingência segura local (PBKDF2).</span>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md bg-white dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-md transition-all">
          <div className="p-6 sm:p-8 bg-linear-to-b from-emerald-950/20 to-transparent border-b border-slate-100 dark:border-slate-800/80 text-center">
            <div className="inline-block p-2 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-200/60 dark:border-slate-700/60 mb-3.5">
              <FiscalizaLogo size="lg" />
            </div>

            <div className="flex items-center justify-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                FISCALIZA - Etapa de Campo
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                CSB / SEMA-MT
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Ecossistema Integrado CSB · Administra · Fiscaliza · Classifica · Notifica
            </p>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-1.5 gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleSwitchMode('login')}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode('register')}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Solicitar Acesso</span>
            </button>

            {!hasAdmin && (
              <button
                type="button"
                onClick={() => handleSwitchMode('bootstrap')}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mode === 'bootstrap'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldPlus className="w-3.5 h-3.5" />
                <span>1º Admin</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 border ${
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

            {mode === 'bootstrap' && (
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-800 dark:text-purple-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldPlus className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>Configuração Inicial do Administrador</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Nenhum administrador cadastrado neste dispositivo/ambiente ainda. Defina o administrador titular e uma senha forte para iniciar.
                </p>
              </div>
            )}

            {mode === 'register' && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Cadastro Prévio de Fiscal de Campo</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Defina sua senha pessoal forte. Seu pedido aguardará homologação de um Administrador da CSB/SEMA-MT.
                </p>
              </div>
            )}

            {(mode === 'register' || mode === 'bootstrap') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Nome completo do servidor"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all"
                />
              </div>
            )}

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
                  placeholder="servidor@sema.mt.gov.br"
                  className="w-full text-xs sm:text-sm pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {(mode === 'register' || mode === 'bootstrap') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cargo / Função *
                  </label>
                  <input
                    type="text"
                    required
                    value={cargo}
                    onChange={e => setCargo(e.target.value)}
                    placeholder="ex: Coordenador(a) / Fiscal"
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Matrícula Funcional *
                  </label>
                  <input
                    type="text"
                    required
                    value={matricula}
                    onChange={e => setMatricula(e.target.value)}
                    placeholder="ex: CSB-001"
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {mode === 'login' ? 'Senha de Acesso *' : 'Definir Senha Forte *'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs sm:text-sm pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  tabIndex={-1}
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode !== 'login' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Mínimo 8 caracteres com maiúsculas, minúsculas e número ou símbolo.
                </p>
              )}
            </div>

            {(mode === 'register' || mode === 'bootstrap') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirmar Senha *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha forte"
                    className="w-full text-xs sm:text-sm pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processando...</span>
                </>
              ) : mode === 'login' ? (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : mode === 'bootstrap' ? (
                <>
                  <span>Criar Administrador e Entrar</span>
                  <ShieldPlus className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Enviar Solicitação de Acesso</span>
                  <UserCheck className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 space-y-1 text-center">
            <div className="flex items-center justify-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Ambiente Protegido e Auditado pela CSB/SEMA-MT</span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              AES-GCM 256-bit · PBKDF2-SHA256 (120k iterações) · Selo SHA-256
            </p>
          </div>
        </div>
      </div>

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
