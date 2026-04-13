import { Outlet, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { SettingsPage } from './settings-page';
import { SetupReviewPage } from './setup-review-page';
import { SetupSeedPage } from './setup-seed-page';
import { SetupSecurityPage } from './setup-security-page';
import { WalletHomePage } from './wallet-home-page';
import { hasSeedVault } from './lib/webauthn-prf-vault';

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

const requireConfiguredVault = async () => {
  const existingVault = await hasSeedVault();
  if (!existingVault) {
    throw redirect({ to: '/setup/seed' });
  }
};

const redirectSetupWhenVaultExists = async () => {
  const existingVault = await hasSeedVault();
  if (existingVault) {
    throw redirect({ to: '/' });
  }
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WalletHomePage,
  beforeLoad: requireConfiguredVault,
});

const setupSeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup/seed',
  component: SetupSeedPage,
  beforeLoad: redirectSetupWhenVaultExists,
});

const setupSecurityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup/security',
  component: SetupSecurityPage,
  beforeLoad: redirectSetupWhenVaultExists,
});

const setupReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup/review',
  component: SetupReviewPage,
  beforeLoad: redirectSetupWhenVaultExists,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupSeedRoute,
  setupSecurityRoute,
  setupReviewRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
