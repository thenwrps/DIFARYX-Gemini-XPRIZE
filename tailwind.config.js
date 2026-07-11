/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Scientific Intelligence Workspace tokens. These retain the established
        // Tailwind aliases while bringing the workspace surfaces onto the approved
        // high-clarity palette.
        primary: '#2783DE',
        navy: '#101828',
        'navy-light': '#1E293B',
        background: '#ffffff',
        surface: '#F9F8F7',
        'surface-hover': '#F0EFED',
        border: '#E6E5E3',
        'text-main': '#2C2C2B',
        'text-muted': '#7D7A75',
        'text-dim': '#A19E99',
        accent: '#2783DE',
        canvas: '#FFFFFF',
        soft: '#F9F8F7',
        soft2: '#F0EFED',
        'blue-soft': '#E5F2FC',
        green: '#46A171',
        'green-soft': '#E8F1EC',
        orange: '#D5803B',
        'orange-soft': '#FBEBDE',
        red: '#E56458',
        'red-soft': '#FCE9E7',
        indigo: '#3B4BD8',
        'tech-xrd': '#2783DE',
        'tech-xps': '#8A5CF6',
        'tech-ftir': '#E56458',
        'tech-raman': '#46A171',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
