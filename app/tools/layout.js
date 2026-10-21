import AppHeader, { AppFooter } from '@/app/components/AppHeader';

export default function ToolsLayout({ children }) {
  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main">{children}</main>
      <AppFooter />
    </div>
  );
}
