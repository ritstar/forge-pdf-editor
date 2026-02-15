import AuthForm from '@/app/components/AuthForm';

export default async function SignupPage({ searchParams }) {
  const params = await searchParams;
  const nextPath =
    typeof params?.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : '/app';

  return <AuthForm mode="signup" nextPath={nextPath} />;
}
