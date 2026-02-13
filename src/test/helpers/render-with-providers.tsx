import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/auth-context';
import { RelayPoolContext } from '@/hooks/use-relay-pool';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import type { SimplePool } from 'nostr-tools/pool';

interface ProviderOptions {
  queryClient?: QueryClient;
  pool?: SimplePool;
}

function createWrapper({ queryClient, pool }: ProviderOptions = {}) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

  return function Wrapper({ children }: { children: ReactNode }) {
    const content = (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );

    if (pool) {
      return (
        <RelayPoolContext.Provider value={pool}>{content}</RelayPoolContext.Provider>
      );
    }

    return content;
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { providerOptions?: ProviderOptions },
) {
  const { providerOptions, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: createWrapper(providerOptions),
    ...renderOptions,
  });
}
