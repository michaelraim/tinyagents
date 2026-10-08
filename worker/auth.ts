import { betterAuth, type BetterAuthOptions } from 'better-auth';
import type { D1Database } from '@cloudflare/workers-types';

export interface AuthEnv {
  AUTH_DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  AUTH_BASE_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITLAB_CLIENT_ID?: string;
  GITLAB_CLIENT_SECRET?: string;
}
export const providers = (env: AuthEnv) => ({
  github: !!(env.AUTH_DB && env.BETTER_AUTH_SECRET && env.AUTH_BASE_URL && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  gitlab: !!(env.AUTH_DB && env.BETTER_AUTH_SECRET && env.AUTH_BASE_URL && env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET),
});
export function createAuth(env: AuthEnv, database: BetterAuthOptions['database'] = env.AUTH_DB) {
  const enabled = providers(env);
  return betterAuth({
    appName: 'tinyAGENTS',
    baseURL: env.AUTH_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database,
    emailAndPassword: { enabled: false },
    socialProviders: {
      ...(enabled.github ? { github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! } } : {}),
      ...(enabled.gitlab ? { gitlab: { clientId: env.GITLAB_CLIENT_ID!, clientSecret: env.GITLAB_CLIENT_SECRET! } } : {}),
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, disableSessionRefresh: true, cookieCache: { enabled: false } },
    advanced: { cookiePrefix: 'tinyagents', useSecureCookies: env.AUTH_BASE_URL?.startsWith('https:'), disableOriginCheck: false, disableCSRFCheck: false },
    // The Worker supplies a shared Cloudflare limiter; per-isolate memory limits
    // would be inconsistent across regions and disappear on cold starts.
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
}
