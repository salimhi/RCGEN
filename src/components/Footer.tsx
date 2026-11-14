import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

export default function Footer() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  if (location.pathname.startsWith('/test/')) {
    return null;
  }

  return (
    <footer
      className="mt-20 border-t"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-tint)'
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pb-10 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-soft)' }}
            >
              RC Practice
            </h2>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <li>
                <Link to="/?exam=CAT" className="hover:underline">
                  CAT RC practice
                </Link>
              </li>
              <li>
                <Link to="/?exam=GMAT" className="hover:underline">
                  GMAT Focus RC practice
                </Link>
              </li>
              <li>
                <Link to="/library?topic=Philosophy" className="hover:underline">
                  Aeon essay RC practice
                </Link>
              </li>
              <li>
                <Link to="/library" className="hover:underline">
                  Practice by topic
                </Link>
              </li>
              <li>
                <Link to="/live" className="hover:underline">
                  Daily Live RC Arena
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-soft)' }}
            >
              Previous Year Papers
            </h2>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <li>
                <Link to="/pyq" className="hover:underline">
                  CAT RC PYQ 2021–2025 (60 sets)
                </Link>
              </li>
              <li>
                <Link to="/pyq?year=2025" className="hover:underline">
                  CAT 2025 Slot 1–3 Passages
                </Link>
              </li>
              <li>
                <Link to="/pyq?year=2024" className="hover:underline">
                  CAT 2024 Slot 1–3 Passages
                </Link>
              </li>
              <li>
                <Link to="/pyq?year=2023" className="hover:underline">
                  CAT 2023 Slot 1–3 Passages
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-soft)' }}
            >
              Free Tools
            </h2>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <li>
                <Link to="/tools?tab=calculator" className="hover:underline">
                  CAT VARC percentile calculator
                </Link>
              </li>
              <li>
                <Link to="/tools?tab=speed" className="hover:underline">
                  Reading speed (WPM) test
                </Link>
              </li>
              <li>
                <Link to="/reports" className="hover:underline">
                  Personal VARC report card
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-soft)' }}
            >
              Guides &amp; Strategy
            </h2>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <li>
                <Link to="/guides?slug=cat-varc-preparation" className="hover:underline">
                  CAT VARC preparation
                </Link>
              </li>
              <li>
                <Link to="/guides?slug=gmat-verbal-preparation" className="hover:underline">
                  GMAT verbal preparation
                </Link>
              </li>
              <li>
                <Link to="/guides?slug=rc-question-types-explained" className="hover:underline">
                  RC question types &amp; traps
                </Link>
              </li>
              <li>
                <Link to="/guides" className="hover:underline">
                  All strategy guides
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs" style={{ color: 'var(--color-text-soft)' }}>
          <p>
            © 2026 PracticeRC — Free CAT &amp; GMAT Reading Comprehension practice generated from any article.
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-lg border cursor-pointer font-medium"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)'
              }}
            >
              {theme === 'dark' ? '☀ Switch to Parchment Light' : '☾ Switch to Forest Dark'}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
