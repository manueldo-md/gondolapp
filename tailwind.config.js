/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // ── COLORES DE MARCA GONDOLAPP ──────────────────────────────────────

        // Verde — color primario de gondoleros y la plataforma
        'gondo-verde': {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          400: '#1D9E75',
          600: '#0F6E56',
          900: '#04342C',
        },

        // Índigo — color de marcas (panel web marca)
        'gondo-indigo': {
          50:  '#EEEDFE',
          100: '#CECBF6',
          400: '#7F77DD',
          600: '#4F46E5',
          900: '#26215C',
        },

        // Ámbar — color de distribuidoras (panel web distri)
        'gondo-amber': {
          50:  '#FAEEDA',
          100: '#FAC775',
          400: '#BA7517',
          600: '#854F0B',
          900: '#412402',
        },

        // Rojo — alertas y errores
        'gondo-red': {
          50:  '#FCEBEB',
          100: '#F7C1C1',
          400: '#E24B4A',
          600: '#A32D2D',
          900: '#501313',
        },

        // Azul — información
        'gondo-blue': {
          50:  '#E6F1FB',
          100: '#B5D4F4',
          400: '#378ADD',
          600: '#185FA5',
          900: '#042C53',
        },

        // Admin — dark navy para el backend interno
        'gondo-admin': '#1E1B4B',

        // ── CSS VARIABLES DE SHADCN/UI ──────────────────────────────────────
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      // Tipografía
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },

      // Animaciones para shadcn/ui
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Para el indicador GPS pulsando
        'gps-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(1.2)' },
        },
        // Para el spinner de carga
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'gps-pulse': 'gps-pulse 1.5s ease-in-out infinite',
      },

      // Tamaños mínimos de toque para mobile (44px)
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
