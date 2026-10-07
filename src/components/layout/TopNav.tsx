import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Sun, 
  Moon, 
  Laptop, 
  Bell, 
  Plus, 
  Menu, 
  ChevronDown
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface TopNavProps {
  onOpenMobileMenu: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ onOpenMobileMenu }) => {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Generate breadcrumb info
  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentSection = pathParts[0] || 'dashboard';

  return (
    <header className="sticky top-0 z-20 h-[56px] border-b border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-4 flex items-center justify-between">
      {/* Left: Mobile Toggle & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 rounded-[4px] text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav className="flex items-center gap-2 text-[13px]">
          <span className="text-[#64748B] dark:text-[#94A3B8]">DocFlow</span>
          <span className="text-[#CBD5E1] dark:text-[#475569]">/</span>
          <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC] capitalize">
            {currentSection === 'qa' ? 'Document Q&A' : currentSection}
          </span>
          {pathParts.length > 1 && (
            <>
              <span className="text-[#CBD5E1] dark:text-[#475569]">/</span>
              <span className="font-mono text-[12px] text-[#1E40AF] dark:text-[#60A5FA]">
                {pathParts[1]}
              </span>
            </>
          )}
        </nav>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Quick Upload Button */}
        {location.pathname !== '/upload' && (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => navigate('/upload')}
            className="hidden sm:inline-flex"
          >
            Upload Document
          </Button>
        )}

        {/* Global OCR Pipeline indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[#F1F5F9] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#334155] text-[11px] font-mono text-[#475569] dark:text-[#94A3B8]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
          <span>Textract Pipeline: Ready</span>
        </div>

        {/* Theme Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setThemeDropdownOpen(!themeDropdownOpen);
              setUserMenuOpen(false);
              setNotificationsOpen(false);
            }}
            title={`Theme: ${theme}`}
            className="p-1.5 rounded-[4px] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] border border-transparent hover:border-[#CBD5E1] dark:hover:border-[#475569] transition-all flex items-center gap-1"
          >
            {theme === 'light' && <Sun className="w-4 h-4 text-[#D97706]" />}
            {theme === 'dark' && <Moon className="w-4 h-4 text-[#38BDF8]" />}
            {theme === 'system' && <Laptop className="w-4 h-4 text-[#64748B]" />}
            <ChevronDown className="w-3 h-3 text-[#94A3B8]" />
          </button>

          {themeDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-36 rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] shadow-layer2 py-1 text-[12px] z-50">
              <button
                onClick={() => { setTheme('light'); setThemeDropdownOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#F1F5F9] dark:hover:bg-[#334155] ${theme === 'light' ? 'font-semibold text-[#1E40AF] dark:text-[#60A5FA]' : 'text-[#334155] dark:text-[#E2E8F0]'}`}
              >
                <Sun className="w-3.5 h-3.5 text-[#D97706]" />
                Light
              </button>
              <button
                onClick={() => { setTheme('dark'); setThemeDropdownOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#F1F5F9] dark:hover:bg-[#334155] ${theme === 'dark' ? 'font-semibold text-[#1E40AF] dark:text-[#60A5FA]' : 'text-[#334155] dark:text-[#E2E8F0]'}`}
              >
                <Moon className="w-3.5 h-3.5 text-[#38BDF8]" />
                Dark
              </button>
              <button
                onClick={() => { setTheme('system'); setThemeDropdownOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#F1F5F9] dark:hover:bg-[#334155] ${theme === 'system' ? 'font-semibold text-[#1E40AF] dark:text-[#60A5FA]' : 'text-[#334155] dark:text-[#E2E8F0]'}`}
              >
                <Laptop className="w-3.5 h-3.5 text-[#64748B]" />
                System
              </button>
            </div>
          )}
        </div>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setThemeDropdownOpen(false);
              setUserMenuOpen(false);
            }}
            className="relative p-1.5 rounded-[4px] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#1E40AF]" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-1.5 w-80 rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] shadow-layer2 p-3 text-[12px] z-50">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] dark:border-[#334155] mb-2">
                <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">System Alerts</span>
                <span className="text-[10px] text-[#64748B]">2 new</span>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded-[4px] bg-[#EFF6FF] dark:bg-[#1E3A8A30] border border-[#BFDBFE] dark:border-[#1E40AF]">
                  <div className="font-medium text-[#1E40AF] dark:text-[#93C5FD]">OCR Batch #4109 Complete</div>
                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">3 documents classified and indexed in S3 vault.</div>
                  <div className="text-[10px] text-[#64748B] mt-1 font-mono">4 mins ago</div>
                </div>
                <div className="p-2 rounded-[4px] bg-[#FFFBEB] dark:bg-[#78350F30] border border-[#FDE68A] dark:border-[#92400E]">
                  <div className="font-medium text-[#92400E] dark:text-[#FBBF24]">Low DPI Warning: 1 document</div>
                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">application_form_claim.pdf requires resolution review.</div>
                  <div className="text-[10px] text-[#64748B] mt-1 font-mono">1 hr ago</div>
                </div>
              </div>
              <button
                onClick={() => { setNotificationsOpen(false); navigate('/activity'); }}
                className="w-full mt-2.5 text-center text-[11px] text-[#1E40AF] dark:text-[#60A5FA] hover:underline font-medium"
              >
                View all activity logs →
              </button>
            </div>
          )}
        </div>

        {/* User Avatar Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setThemeDropdownOpen(false);
              setNotificationsOpen(false);
            }}
            className="flex items-center gap-1.5 p-1 rounded-[4px] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#1E40AF] text-white flex items-center justify-center text-[11px] font-semibold">
              AP
            </div>
            <ChevronDown className="w-3 h-3 text-[#64748B]" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] shadow-layer2 py-1.5 text-[12px] z-50">
              <div className="px-3 py-1.5 border-b border-[#E2E8F0] dark:border-[#334155]">
                <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{user?.name || 'Alex Parker'}</div>
                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">{user?.email || 'alex.parker@enterprise.internal'}</div>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                className="w-full px-3 py-1.5 text-left text-[#334155] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
              >
                Settings & Preferences
              </button>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/activity'); }}
                className="w-full px-3 py-1.5 text-left text-[#334155] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
              >
                Security & Audit Trail
              </button>
              <div className="my-1 border-t border-[#E2E8F0] dark:border-[#334155]" />
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                  navigate('/login');
                }}
                className="w-full px-3 py-1.5 text-left text-[#E11D48] hover:bg-[#FFF1F2] dark:hover:bg-[#88133740]"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
