import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  noPadding?: boolean;
  contentClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  headerAction,
  noPadding = false,
  contentClassName = '',
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] overflow-hidden ${className}`}
      {...props}
    >
      {(title || headerAction) && (
        <div className="flex items-center justify-between min-h-[44px] px-4 py-2 border-b border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B]">
          <div className="flex flex-col">
            {typeof title === 'string' ? (
              <h3 className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                {title}
              </h3>
            ) : (
              title
            )}
            {subtitle && (
              <p className="text-[12px] text-[#64748B] dark:text-[#94A3B8]">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
        </div>
      )}
      <div className={`${noPadding ? '' : 'p-4'} ${contentClassName}`}>{children}</div>
    </div>
  );
};
