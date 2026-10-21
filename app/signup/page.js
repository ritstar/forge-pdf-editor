import AuthForm from '@/app/components/AuthForm';
import { safeNextPath } from '@/lib/safeRedirect';

export default async function SignupPage({ searchParams }) {
  const params = await searchParams;
  return <AuthForm mode="signup" nextPath={safeNextPath(params?.next)} />;
}
