import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProfileProvider } from './contexts/ProfileContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import PlayerPage from './pages/PlayerPage';
import LibraryPage from './pages/LibraryPage';
import LiveArenaPage from './pages/LiveArenaPage';
import PyqPage from './pages/PyqPage';
import ToolsPage from './pages/ToolsPage';
import ReportsPage from './pages/ReportsPage';
import GuidesPage from './pages/GuidesPage';

function AppShell() {
  const location = useLocation();
  const isTestRoute = location.pathname.startsWith('/test/');

  useEffect(() => {
    if (isTestRoute) {
      document.documentElement.classList.remove('theme-ink-wash');
    } else {
      document.documentElement.classList.add('theme-ink-wash');
    }
    return () => {
      document.documentElement.classList.remove('theme-ink-wash');
    };
  }, [isTestRoute]);

  return (
    <div className={`min-h-screen flex flex-col ${isTestRoute ? '' : 'theme-ink-wash'}`}>
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/test/:id" element={<PlayerPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/live" element={<LiveArenaPage />} />
          <Route path="/pyq" element={<PyqPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/guides" element={<GuidesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <HashRouter>
          <AppShell />
        </HashRouter>
      </ProfileProvider>
    </ThemeProvider>
  );
}
