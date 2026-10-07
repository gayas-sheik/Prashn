import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { MobileNav } from './MobileNav';

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-prashn-canvas-light dark:bg-prashn-canvas-dark text-prashn-text-primary-light dark:text-prashn-text-primary-dark">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
      </div>

      {/* Mobile Drawer */}
      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* Main Fluid Shell */}
      <div
        className={`transition-all duration-200 ease-in-out flex flex-col min-h-screen ${
          collapsed ? 'lg:ml-[64px]' : 'lg:ml-[240px]'
        }`}
      >
        <TopNav onOpenMobileMenu={() => setMobileOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
