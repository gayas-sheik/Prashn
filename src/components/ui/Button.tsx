import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  className = '',
  disabled,
  ...props
}) => {
  // Stitch Design System:
  // Primary: Base #1E40AF with active #2563EB and light surface wash #EFF6FF.
  // Secondary: Surface #FFFFFF, border 1px solid #CBD5E1, text #334155. Hover #F8FAFC.
  // Tertiary/Ghost: Transparent, text #475569. Hover #F1F5F9.
  // Destructive: #E11D48, text #FFFFFF, hover #BE123C.
  // Height: 36px (default), 32px (compact/sm). Radius: 4px (rounded-sm).

  let variantStyles = '';
  switch (variant) {
    case 'primary':
      variantStyles = 'bg-[#1E40AF] hover:bg-[#1D4ED8] active:bg-[#1E3A8A] text-white font-medium border border-transparent shadow-none';
      break;
    case 'secondary':
      variantStyles = 'bg-white dark:bg-[#1E293B] hover:bg-[#F8FAFC] dark:hover:bg-[#28394E] text-[#334155] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#475569] font-medium';
      break;
    case 'tertiary':
      variantStyles = 'bg-transparent hover:bg-[#F1F5F9] dark:hover:bg-[#334155] text-[#475569] dark:text-[#94A3B8] font-medium border border-transparent';
      break;
    case 'destructive':
      variantStyles = 'bg-[#E11D48] hover:bg-[#BE123C] active:bg-[#9F1239] text-white font-medium border border-transparent';
      break;
    case 'outline':
      variantStyles = 'bg-transparent hover:bg-[#EFF6FF] dark:hover:bg-[#1E293B] text-[#1E40AF] dark:text-[#38BDF8] border border-[#1E40AF] dark:border-[#38BDF8] font-medium';
      break;
  }

  let sizeStyles = '';
  switch (size) {
    case 'sm':
      sizeStyles = 'h-[32px] px-2.5 text-[12px]';
      break;
    case 'md':
      sizeStyles = 'h-[36px] px-3.5 text-[13px]';
      break;
    case 'lg':
      sizeStyles = 'h-[40px] px-4 text-[14px]';
      break;
  }

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-[4px] transition-colors focus:outline-none focus:ring-1 focus:ring-[#1E40AF] disabled:opacity-50 disabled:cursor-not-allowed select-none ${variantStyles} ${sizeStyles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && iconPosition === 'left' && <span className="flex-shrink-0 text-current">{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && <span className="flex-shrink-0 text-current">{icon}</span>}
    </button>
  );
};
