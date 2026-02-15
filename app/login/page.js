import AuthForm from '@/app/components/AuthForm';

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const nextPath =
    typeof params?.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : '/app';

  return <AuthForm mode="login" nextPath={nextPath} />;
}
