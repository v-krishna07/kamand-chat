import React, { createContext, useContext, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { SPRING_CRITICALLY_DAMPED, REDUCED_MOTION_CROSSFADE } from './presets.js';

interface MotionPreferencesContextValue {
  prefersReducedMotion: boolean;
  prefersReducedTransparency: boolean;
  prefersHighContrast: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const MotionPreferencesContext = createContext<MotionPreferencesContextValue>({
  prefersReducedMotion: false,
  prefersReducedTransparency: false,
  prefersHighContrast: false,
  theme: 'dark',
  toggleTheme: () => undefined,
});

export function useMotionPreferences(): MotionPreferencesContextValue {
  return useContext(MotionPreferencesContext);
}

export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [prefersReducedTransparency, setPrefersReducedTransparency] = useState(false);
  const [prefersHighContrast, setPrefersHighContrast] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('kamand_theme') : null;
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const transMq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const contrastMq = window.matchMedia('(prefers-contrast: more)');

    const sync = () => {
      setPrefersReducedMotion(motionMq.matches);
      setPrefersReducedTransparency(transMq.matches);
      setPrefersHighContrast(contrastMq.matches);
    };
    sync();

    motionMq.addEventListener?.('change', sync);
    transMq.addEventListener?.('change', sync);
    contrastMq.addEventListener?.('change', sync);

    return () => {
      motionMq.removeEventListener?.('change', sync);
      transMq.removeEventListener?.('change', sync);
      contrastMq.removeEventListener?.('change', sync);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    // Eased theme switch without abrupt flash (Deliverable 7)
    root.classList.add('theme-transitioning');
    if (next === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('kamand_theme', next);
    } catch {
      // Ignore storage quota
    }
    setTheme(next);
    window.setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 280);
  };

  return (
    <MotionPreferencesContext.Provider
      value={{
        prefersReducedMotion,
        prefersReducedTransparency,
        prefersHighContrast,
        theme,
        toggleTheme,
      }}
    >
      <MotionConfig
        reducedMotion="user"
        transition={prefersReducedMotion ? REDUCED_MOTION_CROSSFADE : SPRING_CRITICALLY_DAMPED}
      >
        {children}
      </MotionConfig>
    </MotionPreferencesContext.Provider>
  );
};
