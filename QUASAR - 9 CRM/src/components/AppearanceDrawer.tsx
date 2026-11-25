import React, { useEffect } from 'react';
import { Check, Moon, Sun, X } from 'lucide-react';
import { THEMES, type ColorMode, type ThemeId } from '../types/crm';

interface AppearanceDrawerProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeId;
  colorMode: ColorMode;
  onChangeTheme: (theme: ThemeId) => void;
  onChangeColorMode: (mode: ColorMode) => void;
}

export const AppearanceDrawer: React.FC<AppearanceDrawerProps> = ({
  open,
  onClose,
  theme,
  colorMode,
  onChangeTheme,
  onChangeColorMode,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      role="dialog"
      aria-modal="true"
      aria-label="Appearance and Theme Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-elevated flex h-full w-full max-w-md flex-col p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Appearance & Theme Matrix</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Every theme transforms geometry, multi-color prismatic glass (92% transparent · 5% blur main cards, 60% transparent · 10% blur overlays), and ambient glow across Light & Dark modes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close appearance drawer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-opacity hover:opacity-80"
            style={{ color: 'var(--text-primary)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
          {/* Light / Dark Mode Switch */}
          <div>
            <span className="mb-3 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Color Mode
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChangeColorMode('light')}
                className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium whitespace-nowrap transition-[transform,opacity,border-color,box-shadow] ${
                  colorMode === 'light'
                    ? 'liquid-glass-active'
                    : 'liquid-surface hover:opacity-90'
                }`}
              >
                <Sun className="h-4 w-4" />
                Light Mode
              </button>
              <button
                type="button"
                onClick={() => onChangeColorMode('dark')}
                className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium whitespace-nowrap transition-[transform,opacity,border-color,box-shadow] ${
                  colorMode === 'dark'
                    ? 'liquid-glass-active'
                    : 'liquid-surface hover:opacity-90'
                }`}
              >
                <Moon className="h-4 w-4" />
                Dark Mode
              </button>
            </div>
          </div>

          {/* 8 Full-Appearance Themes */}
          <div>
            <span className="mb-3 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Workspace Theme ({THEMES.length} themes · {THEMES.length * 2} modes)
            </span>
            <div className="space-y-3">
              {THEMES.map((item) => {
                const isActive = item.id === theme;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeTheme(item.id)}
                    className={`flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left transition-[transform,opacity,border-color,box-shadow] ${
                      isActive ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="flex shrink-0 items-center -space-x-1.5">
                        <span
                          className="h-6 w-6 rounded-full border border-white/30"
                          style={{ backgroundColor: colorMode === 'dark' ? item.swatchDark : item.swatchLight }}
                        />
                        <span
                          className="h-6 w-6 rounded-full border border-white/30"
                          style={{ backgroundColor: item.accentSwatch }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{item.name}</div>
                        <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                          {item.subtitle}
                        </div>
                      </div>
                    </div>
                    {isActive && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
