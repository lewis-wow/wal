import { Outlet, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { Onboarding } from './onboarding';
import { ChatLayout } from './components/chat-layout';
import { SecurityDashboard } from './components/security-dashboard';
import { chatStore, setSeed } from './lib/chat-store';
import { loadSeed } from './lib/seed-vault';

const RootLayout = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
};

const rootRoute = createRootRoute({ component: RootLayout });

const requireSeed = async () => {
  let seed = chatStore.getState().chat.seed;

  if (!seed) {
    const persisted = await loadSeed();
    if (persisted) {
      chatStore.dispatch(setSeed(persisted));
      seed = persisted;
    }
  }

  if (!seed) {
    throw redirect({ to: '/' });
  }
};

const redirectIfSeedExists = async () => {
  let seed = chatStore.getState().chat.seed;

  if (!seed) {
    const persisted = await loadSeed();
    if (persisted) {
      seed = persisted;
    }
  }

  if (seed) {
    throw redirect({ to: '/chat' });
  }
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Onboarding,
  beforeLoad: redirectIfSeedExists,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatLayout,
  beforeLoad: requireSeed,
});

const securityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/security',
  component: SecurityDashboard,
  beforeLoad: requireSeed,
});

const routeTree = rootRoute.addChildren([indexRoute, chatRoute, securityRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
