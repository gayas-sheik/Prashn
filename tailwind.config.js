/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        prashn: {
          canvas: {
            light: '#F8FAFC',
            dark: '#0F172A',
          },
          surface: {
            light: '#FFFFFF',
            dark: '#1E293B',
            recessed: {
              light: '#F1F5F9',
              dark: '#334155',
            },
            elevated: {
              light: '#FFFFFF',
              dark: '#243248',
            }
          },
          border: {
            subtle: {
              light: '#E2E8F0',
              dark: '#334155',
            },
            divider: {
              light: '#CBD5E1',
              dark: '#475569',
            }
          },
          primary: {
            DEFAULT: '#1E40AF',
            hover: '#1D4ED8',
            active: '#1E3A8A',
            deep: '#00288E',
            light: '#EFF6FF',
            dark: '#3B82F6',
          },
          secondary: {
            DEFAULT: '#0051D5',
            container: '#316BF3',
          },
          text: {
            primary: {
              light: '#0F172A',
              dark: '#F8FAFC',
            },
            secondary: {
              light: '#444653',
              dark: '#94A3B8',
            },
            muted: {
              light: '#64748B',
              dark: '#64748B',
            }
          },
          status: {
            success: {
              text: '#059669',
              bg: '#ECFDF5',
              border: '#A7F3D0',
              darkText: '#34D399',
              darkBg: '#064E3B40',
              darkBorder: '#065F46',
            },
            warning: {
              text: '#D97706',
              bg: '#FFFBEB',
              border: '#FDE68A',
              darkText: '#FBBF24',
              darkBg: '#78350F40',
              darkBorder: '#92400E',
            },
            error: {
              text: '#E11D48',
              bg: '#FFF1F2',
              border: '#FECDD3',
              darkText: '#F87171',
              darkBg: '#88133740',
              darkBorder: '#9F1239',
            },
            info: {
              text: '#0284C7',
              bg: '#F0F9FF',
              border: '#BAE6FD',
              darkText: '#38BDF8',
              darkBg: '#0C4A6E40',
              darkBorder: '#0369A1',
            }
          }
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xs': '2px',
        'sm': '4px',
        'DEFAULT': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
      },
      boxShadow: {
        'layer1': 'none',
        'layer2': '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
        'layer3': '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06)',
      }
    },
  },
  plugins: [],
}
