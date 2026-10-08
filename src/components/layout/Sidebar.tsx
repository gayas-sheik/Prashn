import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  UploadCloud, 
  Cpu, 
  Clock, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggleCollapse }) => {
  const { user } = useAuth();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Documents', path: '/documents', icon: FileText, count: '128' },
    { label: 'Upload Documents', path: '/upload', icon: UploadCloud },
    { label: 'Processing Queue', path: '/processing', icon: Cpu, badge: '6 active' },
    { label: 'Activity & Audit Log', path: '/activity', icon: Clock },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 h-screen z-30 transition-all duration-200 ease-in-out border-r border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] flex flex-col justify-between ${
        collapsed ? 'w-[64px]' : 'w-[240px]'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="flex items-center justify-between h-[56px] px-3.5 border-b border-[#E2E8F0] dark:border-[#334155]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-[4px] bg-[#1E40AF] flex items-center justify-center flex-shrink-0 text-white shadow-sm">
              <Layers className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[15px] tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
                    Prashn
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-[2px] bg-[#EFF6FF] text-[#1E40AF] dark:bg-[#1E3A8A40] dark:text-[#93C5FD]">
                    Cloud
                  </span>
                </div>
                <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                  Local Workspace
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1 rounded-[4px] text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2.5 py-2 rounded-[4px] text-[13px] font-medium transition-colors group relative ${
                    isActive
                      ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#60A5FA] font-semibold'
                      : 'text-[#444653] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#28394E] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  } ${collapsed ? 'justify-center' : ''}`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && (
                  <span className="truncate flex-1">{item.label}</span>
                )}
                {!collapsed && item.count && (
                  <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded-[2px] bg-[#F1F5F9] dark:bg-[#334155] text-[#64748B] dark:text-[#94A3B8]">
                    {item.count}
                  </span>
                )}
                {!collapsed && item.badge && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[2px] bg-[#E0F2FE] text-[#0284C7] dark:bg-[#0C4A6E40] dark:text-[#38BDF8]">
                    {item.badge}
                  </span>
                )}
                {collapsed && (
                  <div className="absolute left-[70px] bg-[#0F172A] text-white text-[12px] px-2 py-1 rounded-[4px] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-layer2">
                    {item.label}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer / Telemetry & User Card */}
      <div className="p-2 border-t border-[#E2E8F0] dark:border-[#334155] space-y-2">
        {/* Pipeline Health */}
        {!collapsed ? (
          <div className="p-2 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] text-[11px]">
            <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8] mb-1 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
                us-east-1
              </span>
              <span>100% SLA</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#475569] dark:text-[#94A3B8]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#059669]" />
              <span>SOC2 Type II Active</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center p-1" title="Pipeline Health: us-east-1 (100% SLA)">
            <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
          </div>
        )}

        {/* User profile */}
        <div className={`flex items-center gap-2.5 p-1.5 rounded-[4px] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-full bg-[#1E40AF] text-white flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
            AP
          </div>
          {!collapsed && (
            <div className="truncate text-left flex-1">
              <div className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                {user?.name || 'Alex Parker'}
              </div>
              <div className="text-[10px] text-[#64748B] dark:text-[#94A3B8] truncate">
                Cloud Architect
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
