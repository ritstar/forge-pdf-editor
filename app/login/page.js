import AuthForm from '@/app/components/AuthForm';
import { safeNextPath } from '@/lib/safeRedirect';

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  return <AuthForm mode="login" nextPath={safeNextPath(params?.next)} />;
}
