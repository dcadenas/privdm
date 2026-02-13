import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { useGiftWrapSubscription } from '@/hooks/use-gift-wrap-subscription';
import { useReadStateSync } from '@/hooks/use-read-state-sync';
import { useWebNotifications } from '@/hooks/use-web-notifications';
import { LoginScreen } from '@/components/LoginScreen';
import { ChatView } from '@/components/ChatView';
import { AuthCallback } from '@/components/AuthCallback';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      retry: 1,
    },
  },
});

function AppContent() {
  const { isAuthenticated, isRestoring } = useAuth();
  const connectionStatus = useGiftWrapSubscription();
  useReadStateSync();
  useWebNotifications();

  // Handle OAuth callback
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  if (isRestoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-100">
        <div className="text-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-amber-500" />
          <p className="mt-3 text-sm text-gray-400">Reconnecting to your signer...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <ChatView connectionStatus={connectionStatus} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}
