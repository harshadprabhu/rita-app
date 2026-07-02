/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#1B3A7A',
        'primary-dark': '#142D60',
        'primary-light': '#E0EAF6',
        gold: '#C9A46A',
        background: '#F9FAFB',
        surface: '#FFFFFF',
        'text-primary': '#111827',
        'text-secondary': '#6B7280',
        'status-open': '#3B82F6',
        'status-in-progress': '#F59E0B',
        'status-pending': '#8B5CF6',
        'status-resolved': '#10B981',
        'status-closed': '#6B7280',
        'priority-low': '#10B981',
        'priority-medium': '#F59E0B',
        'priority-high': '#EF4444',
        'priority-critical': '#7C2D12',
      },
    },
  },
  plugins: [],
};
