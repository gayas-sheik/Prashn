import React from 'react';

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';
  children: React.ReactNode;
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  icon,
  pulse = false,
  className = '',
}) => {
  let colorStyles = '';
  switch (variant) {
    case 'success':
      colorStyles = 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0] dark:bg-[#064E3B40] dark:text-[#34D399] dark:border-[#065F46]';
      break;
    case 'warning':
      colorStyles = 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A] dark:bg-[#78350F40] dark:text-[#FBBF24] dark:border-[#92400E]';
      break;
    case 'error':
      colorStyles = 'bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3] dark:bg-[#88133740] dark:text-[#F87171] dark:border-[#9F1239]';
      break;
    case 'info':
      colorStyles = 'bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD] dark:bg-[#0C4A6E40] dark:text-[#38BDF8] dark:border-[#0369A1]';
      break;
    case 'primary':
      colorStyles = 'bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE] dark:bg-[#1E3A8A40] dark:text-[#93C5FD] dark:border-[#1E40AF]';
      break;
    case 'neutral':
      colorStyles = 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1] dark:bg-[#33415540] dark:text-[#CBD5E1] dark:border-[#475569]';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 h-[20px] px-2 text-[11px] font-semibold tracking-wide uppercase rounded-[4px] border ${colorStyles} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
