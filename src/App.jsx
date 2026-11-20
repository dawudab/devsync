import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WorkspaceProvider, useWorkspace } from '@/context/WorkspaceContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppShell } from '@/components/layout/AppShell';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { SignInPage } from '@/pages/SignInPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { FeedPage } from '@/pages/FeedPage';
import { RequestsPage } from '@/pages/RequestsPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { SettingsPage } from '@/pages/SettingsPage';

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { workspaces, workspace, loading } = useWorkspace();

  if (authLoading) return <FullScreenLoader />;
  if (!user) return <SignInPage />;
  if (workspaces === null) return <FullScreenLoader label="Loading your workspaces…" />;
  if (workspaces.length === 0) return <OnboardingPage />;
  if (loading) return <FullScreenLoader label="Opening workspace…" />;
  if (!workspace) return <FullScreenLoader label="You no longer have access to this workspace." />;

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<AppShell />}>
        <Route index element={<FeedPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <AppRoutes />
          </WorkspaceProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
