import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
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
import AuthPage from './pages/AuthPage';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col">
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
                <Route path="/login" element={<AuthPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
