import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, ShieldCheck, Lock, Mail, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('alex.parker@enterprise.internal');
  const [password, setPassword] = useState('••••••••••••');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      login(email);
      setLoading(false);
      navigate('/dashboard');
    }, 400);
  };

  const handleDemoLogin = () => {
    login('alex.parker@enterprise.internal');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] shadow-layer2 p-8">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-[6px] bg-[#1E40AF] text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
            <Layers className="w-6 h-6" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-[22px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              DocFlow
            </h1>
            <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-[2px] bg-[#EFF6FF] text-[#1E40AF] dark:bg-[#1E3A8A40] dark:text-[#93C5FD]">
              Enterprise
            </span>
          </div>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-1">
            Cloud-Native Document Processing Platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
              Work Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[38px] pl-9 pr-3 text-[13px] rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                placeholder="name@enterprise.internal"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1]">
                Master Password
              </label>
              <a href="#forgot" className="text-[11px] text-[#1E40AF] dark:text-[#60A5FA] hover:underline">
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[38px] pl-9 pr-3 text-[13px] rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full mt-2"
          >
            Sign In to Enterprise Workspace
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E2E8F0] dark:border-[#334155]" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-white dark:bg-[#1E293B] px-2 text-[#64748B] font-mono">
                or instant demo
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="md"
            icon={<Sparkles className="w-3.5 h-3.5 text-[#1E40AF]" />}
            onClick={handleDemoLogin}
            className="w-full"
          >
            Explore as Alex Parker (Admin Demo)
          </Button>
        </form>

        {/* Security badge */}
        <div className="mt-8 pt-4 border-t border-[#E2E8F0] dark:border-[#334155] flex items-center justify-center gap-1.5 text-[11px] text-[#059669]">
          <ShieldCheck className="w-4 h-4" />
          <span>SOC2 Type II · AWS us-east-1 TLS 1.3 Vault</span>
        </div>
      </div>
    </div>
  );
};
