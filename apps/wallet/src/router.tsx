import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { WalletPage } from './wallet-page';

const RootLayout = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Wal</p>
            <h1 className="text-xl font-semibold">HD Wallet + SLIP39 Backup</h1>
          </div>
          <nav>
            <Link
              to="/"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{ className: 'rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground' }}
            >
              Wallet
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
};

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WalletPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
