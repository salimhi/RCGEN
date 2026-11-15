import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, Menu, X, Sparkles, User as UserIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import ProfileModal from './ProfileModal';

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { displayName } = useProfile();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Hide standard navbar chrome when inside fullscreen Exam Player
  if (location.pathname.startsWith('/test/')) {
    return null;
  }

  const navItems = [
    { label: 'Library', to: '/library' },
    { label: 'Live Arena', to: '/live', badge: 'LIVE' },
    { label: 'CAT PYQs', to: '/pyq' },
    { label: 'Free Tools', to: '/tools' },
    { label: 'Guides', to: '/guides' },
    { label: 'Report Card', to: '/reports' }
  ];

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  return (
    <>
      <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(16, 21, 19, 0.88)' : 'rgba(244, 238, 227, 0.90)',
        borderColor: 'var(--color-border)'
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Brand Mark */}
        <Link to="/" className="flex items-center gap-2.5 group shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm border transition-transform group-hover:scale-105"
            style={{
              backgroundColor: '#18241f',
              borderColor: 'var(--color-border-strong)'
            }}
          >
            <svg viewBox="0 0 64 64" className="w-7 h-7" aria-hidden="true">
              <path d="M19 10h20l8 8v36H19z" fill="#fffaf1" />
              <path d="M39 10v8h8" fill="#e7d8c4" />
              <path d="M23 44h18" stroke="#d26c45" strokeWidth="4.5" strokeLinecap="round" />
              <text
                x="32"
                y="35"
                textAnchor="middle"
                fontFamily="Inter, Arial, sans-serif"
                fontSize="16.5"
                fontWeight="800"
                fill="#18241f"
              >
                RC
              </text>
            </svg>
          </div>
          <div className="flex flex-col">
            <span
              className="font-display font-semibold text-lg tracking-tight leading-none"
              style={{ color: 'var(--color-ink)' }}
            >
              PracticeRC
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-soft)' }}>
              CAT &amp; GMAT Lab
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                style={{
                  color: active ? 'var(--color-ink)' : 'var(--color-text-muted)',
                  backgroundColor: active ? 'var(--color-surface-2)' : 'transparent'
                }}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full"
                    style={{
                      backgroundColor: 'var(--color-correct-soft)',
                      color: 'var(--color-correct)'
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              borderColor: 'transparent'
            }}
            title="AI Reading Comprehension Engine"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline">AI RC Engine</span>
            <span className="xs:hidden">AI RC</span>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="w-9 h-9 rounded-xl flex items-center justify-center border transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)'
            }}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setProfileModalOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:pl-2 sm:pr-3 sm:py-1.5 rounded-xl border text-sm font-medium cursor-pointer transition-colors hover:border-[var(--color-primary)] shrink-0"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)'
            }}
            title="Profile & Settings"
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: 'var(--color-primary-soft)',
                color: 'var(--color-primary)'
              }}
            >
              {displayName ? displayName.charAt(0).toUpperCase() : <UserIcon className="w-3.5 h-3.5" />}
            </span>
            <span className="hidden sm:inline max-w-[110px] truncate">{displayName || 'Profile'}</span>
          </button>

          {/* Mobile Hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center border cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-ink)'
            }}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden border-t px-4 py-3.5 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-150 shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)'
          }}
        >
          {/* Prominent AI RC Engine Entry in Mobile Drawer */}
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold mb-2"
            style={{
              backgroundColor: location.pathname === '/' ? 'var(--color-primary-soft)' : 'var(--color-accent-soft)',
              color: location.pathname === '/' ? 'var(--color-primary)' : 'var(--color-accent)'
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>AI RC Engine</span>
            </div>
            <span className="text-[11px] font-medium opacity-80">Generate Test →</span>
          </Link>

          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{
                backgroundColor: isActive(item.to) ? 'var(--color-surface-2)' : 'transparent',
                color: isActive(item.to) ? 'var(--color-ink)' : 'var(--color-text-muted)'
              }}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className="px-2 py-0.5 text-[10px] font-bold rounded-full"
                  style={{
                    backgroundColor: 'var(--color-correct-soft)',
                    color: 'var(--color-correct)'
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          ))}

          {/* Quick Settings Action inside Mobile Drawer */}
          <div className="pt-2 mt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setProfileModalOpen(true);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink)'
              }}
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Profile &amp; API Keys</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)'
              }}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </div>
      )}
    </header>

    <ProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
  </>
  );
}
