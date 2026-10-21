'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/app/utils/useTheme';

export default function ThemeToggle({ className = '' }) {
  const [theme, toggleTheme] = useTheme();
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button type="button" className={`btn btn-ghost btn-icon ${className}`} onClick={toggleTheme} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
