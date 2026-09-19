import type { AuthConfig } from './auth-config';
import { readAuthConfig } from './auth-config';

export async function connectAfterAuthValidation<T>(
  connect: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ authConfig: AuthConfig; connection: T }> {
  const authConfig = readAuthConfig(env);
  const connection = await connect();
  return { authConfig, connection };
}
