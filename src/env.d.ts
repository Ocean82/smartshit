/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_STRIPE_PUBLIC_KEY: string;
  readonly VITE_APP_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_APP_CLERK_SIGN_IN_URL: string;
  readonly VITE_APP_CLERK_SIGN_UP_URL: string;
  readonly VITE_APP_CLERK_AFTER_SIGN_IN_URL: string;
  readonly VITE_APP_CLERK_AFTER_SIGN_UP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
