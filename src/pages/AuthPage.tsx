import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useAuth } from '../contexts/AuthContext';
import { SITE_NAME } from '../constants';

export default function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/reports', { replace: true });
    }
  }, [user, navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() || email.split('@')[0] }
          }
        });
        if (signUpErr) throw signUpErr;
        if (data.session) {
          navigate('/reports');
        } else {
          setInfo('Account created! You can now sign in with your credentials.');
          setIsSignUp(false);
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (signInErr) throw signInErr;
        navigate('/reports');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestContinue = () => {
    navigate('/reports');
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-12 pb-20">
      <div className="rc-card-elevated p-6 sm:p-8 space-y-6">
        <div className="text-center">
          <span
            className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3"
            style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}
          >
            {SITE_NAME} Account
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--color-ink)' }}>
            {isSignUp ? 'Create your aspirant profile' : `Welcome to ${SITE_NAME}`}
          </h1>
          <p className="text-xs sm:text-sm mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Save generated RC sets, track weak question types, and appear on the Daily Live Arena leaderboard.
          </p>
        </div>

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={() => signInWithGoogle(SITE_NAME)}
          className="w-full py-3 px-4 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2.5 cursor-pointer transition-colors hover:border-[var(--color-primary)]"
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border-strong)',
            color: 'var(--color-ink)'
          }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.6 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Continue as Guest Aspirant */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGuestContinue}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--color-accent)'
          }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Continue as Guest Aspirant (Explore without account)</span>
        </button>

        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-soft)' }}>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <span>or with email</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Display Name (shown on Leaderboard)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Aarav Mehta"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-ink)'
                }}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-soft)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl text-sm border outline-none"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-ink)'
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-soft)' }} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl text-sm border outline-none"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-ink)'
                }}
              />
            </div>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-xl text-xs border"
              style={{
                backgroundColor: 'var(--color-wrong-soft)',
                borderColor: 'var(--color-wrong)',
                color: 'var(--color-wrong)'
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div
              className="flex items-start gap-2 p-3 rounded-xl text-xs border"
              style={{
                backgroundColor: 'var(--color-correct-soft)',
                borderColor: 'var(--color-correct)',
                color: 'var(--color-correct)'
              }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{info}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer"
          >
            {loading ? 'Please wait…' : isSignUp ? 'Create Free Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {isSignUp ? 'Already have an account?' : `New to ${SITE_NAME}?`}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp((s) => !s);
              setError(null);
              setInfo(null);
            }}
            className="font-semibold hover:underline cursor-pointer"
            style={{ color: 'var(--color-primary)' }}
          >
            {isSignUp ? 'Sign in instead' : 'Create a free account'}
          </button>
        </p>
      </div>
    </div>
  );
}
