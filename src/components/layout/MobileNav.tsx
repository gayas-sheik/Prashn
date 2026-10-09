import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  UploadCloud, 
  Cpu, 
  Clock, 
  Settings, 
  X,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ open, onClose }) => {
  const { user } = useAuth();

  if (!open) return null;

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Documents', path: '/documents', icon: FileText },
    { label: 'Upload Documents', path: '/upload', icon: UploadCloud },
    { label: 'Processing Queue', path: '/processing', icon: Cpu },
    { label: 'Activity & Audit Log', path: '/activity', icon: Clock },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#0F172A] bg-opacity-60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-[280px] bg-white dark:bg-[#1E293B] shadow-layer3 flex flex-col justify-between border-r border-[#E2E8F0] dark:border-[#334155]">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between h-[56px] px-4 border-b border-[#E2E8F0] dark:border-[#334155]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-[4px] bg-[#1E40AF] flex items-center justify-center text-white">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold text-[16px] text-[#0F172A] dark:text-[#F8FAFC]">
                Prashn
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close navigation"
              className="p-1 rounded-[4px] text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-[4px] text-[14px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#60A5FA] font-semibold'
                        : 'text-[#444653] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#28394E]'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E2E8F0] dark:border-[#334155]">
          <div className="flex items-center gap-2.5 p-2 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] mb-3">
            <div className="w-8 h-8 rounded-full bg-[#1E40AF] text-white flex items-center justify-center text-[12px] font-bold">
              {user?.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2) || 'U'}
            </div>
            <div className="truncate">
              <div className="text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                {user?.name || 'Account'}
              </div>
              <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                {user?.email || ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#059669]">
            <ShieldCheck className="w-4 h-4" />
            <span>Account-scoped local documents</span>
          </div>
        </div>
      </div>
    </div>
  );
};
