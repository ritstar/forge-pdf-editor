'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ForgeLogo from './ForgeLogo';

function GoogleLogo() {
  return (
    <svg
      className="google-svg"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6382-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0782-1.7963 2.7155v2.2582h2.9082c1.7018-1.5664 2.6845-3.8741 2.6845-6.6146z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1804l-2.9082-2.2582c-.8064.54-1.8368.8591-3.0482.8591-2.3441 0-4.3282-1.5832-5.0363-3.7105H.9573v2.3318A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9636 10.7105A5.412 5.412 0 0 1 3.6818 9c0-.5932.1023-1.1682.2818-1.7105V4.9573H.9573A8.9969 8.9969 0 0 0 0 9c0 1.4523.3482 2.8277.9573 4.0427l3.0063-2.3322z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3454l2.5814-2.5814C13.4623.8918 11.425 0 9 0A8.9969 8.9969 0 0 0 .9573 4.9573l3.0063 2.3322C4.6718 5.1623 6.6559 3.5795 9 3.5795z"
      />
    </svg>
  );
}

export default function AuthForm({ mode, nextPath = '/app' }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const next = nextPath || '/app';

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
        <ForgeLogo href="/" />
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
