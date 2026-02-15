'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.2.8 3.9 1.5l2.6-2.5C16.8 3 14.6 2 12 2 6.8 2 2.6 6.5 2.6 12s4.2 10 9.4 10c5.4 0 9-3.8 9-9.1 0-.6-.1-1.1-.2-1.6H12z" />
      <path fill="#4285F4" d="M21 12.9c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.6-1.2 2.8-2.5 3.7l3 2.3c1.8-1.7 3-4.2 3-7.3z" />
      <path fill="#FBBC05" d="M6 14.1c-.2-.6-.3-1.3-.3-2.1s.1-1.5.3-2.1l-3.1-2.4C2.3 8.8 2 10.4 2 12s.3 3.2.9 4.5L6 14.1z" />
      <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.3c-.8.6-1.9 1-3.4 1-2.6 0-4.9-1.8-5.7-4.2l-3.1 2.4C4.8 19.4 8.1 22 12 22z" />
    </svg>
  );
}

export default function AuthForm({ mode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isSignup = mode === 'signup';

  const handleGoogle = async () => {
    setLoading(true);
    setError('');
    const origin = window.location.origin;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (isSignup) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          data: {
            full_name: name,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        setMessage('Account created. Check your email for verification link if required.');
        router.push('/app');
        router.refresh();
      }
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>{isSignup ? 'Create account' : 'Welcome back'}</h1>
        <p className="muted">{isSignup ? 'Start saving drafts and signatures to your workspace.' : 'Sign in to continue editing your PDFs.'}</p>

        <button className="google-btn wide" onClick={handleGoogle} disabled={loading}>
          <GoogleLogo />
          {loading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <div className="separator">or</div>

        <form onSubmit={handleSubmit} className="stack form-stack">
          {isSignup ? (
            <>
              <label htmlFor="name" className="field-label">Full name</label>
              <input
                id="name"
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </>
          ) : null}

          <label htmlFor="email" className="field-label">Email</label>
          <input
            id="email"
            type="email"
            className="field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password" className="field-label">Password</label>
          <input
            id="password"
            type="password"
            className="field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />

          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="muted">{message}</p> : null}

          <button className="primary-btn wide" type="submit" disabled={loading}>
            {isSignup ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <p className="muted auth-switch">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Link href={isSignup ? '/login' : '/signup'}>{isSignup ? 'Login' : 'Create one'}</Link>
        </p>
      </section>
    </main>
  );
}
