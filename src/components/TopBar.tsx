import React from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { AppSection, AuthUserSummary } from '../types/meetup';
import { GoogleSignInButton } from './GoogleSignInButton';

interface TopBarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user: AuthUserSummary | null;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  onNavigateHome: () => void;
  onSelectSection: (section: AppSection) => void;
  activeSection: AppSection;
  pendingRequestsCount: number;
  inRoom: boolean;
  authBusy?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  darkMode,
  onToggleDarkMode,
  user,
  onGoogleSignIn,
  onSignOut,
  onNavigateHome,
  onSelectSection,
  activeSection,
  pendingRequestsCount,
  inRoom,
  authBusy = false,
}) => {
  const navItems: Array<{ id: AppSection; label: string }> = [
    { id: 'meetups', label: inRoom ? 'חזרה למפגשים' : 'מפגשים' },
    {
      id: 'friends',
      label:
        pendingRequestsCount > 0 ? `חברים (${pendingRequestsCount})` : 'חברים',
    },
    { id: 'groups', label: 'קבוצות' },
    { id: 'profile', label: 'פרופיל והגדרות' },
  ];

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-[#141A23]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
        <button
          type="button"
          onClick={onNavigateHome}
          className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
        >
          נפגשים
        </button>

        <nav
          aria-label="ניווט ראשי"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {navItems.map((item) => {
            const isActive = !inRoom && activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 ${
                  isActive
                    ? 'text-[#1E3A5F] dark:text-[#6AA2E8] font-semibold underline underline-offset-8 decoration-2'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={darkMode ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
            title={darkMode ? 'מצב בהיר' : 'מצב כהה'}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {user?.isGoogleUser ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>התנתק</span>
              </button>
            </div>
          ) : (
            <GoogleSignInButton
              onClick={onGoogleSignIn}
              disabled={authBusy}
              label="כניסה עם Google"
              className="!h-9 !px-3 !text-xs"
            />
          )}
        </div>
      </div>
    </header>
  );
};
