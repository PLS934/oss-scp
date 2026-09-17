import type { EnvironmentReference, HttpAuthentication } from './types';

export class HttpAuthenticationError extends Error {
  constructor(public readonly environmentVariable: string) {
    super(`required HTTP authentication environment variable is unavailable: ${environmentVariable}`);
    this.name = 'HttpAuthenticationError';
  }
}

function environmentValue(
  reference: EnvironmentReference,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const value = environment[reference.env];
  if (!value || /[\r\n]/.test(value)) throw new HttpAuthenticationError(reference.env);
  return value;
}

export function resolveHttpAuthenticationHeaders(
  authentication: HttpAuthentication | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string>> {
  if (!authentication) return {};
  if (authentication.type === 'apiKey') {
    return { [authentication.header]: environmentValue(authentication.valueRef, environment) };
  }
  if (authentication.type === 'bearer') {
    return { authorization: `Bearer ${environmentValue(authentication.tokenRef, environment)}` };
  }
  const username = environmentValue(authentication.usernameRef, environment);
  const password = environmentValue(authentication.passwordRef, environment);
  if (username.includes(':')) throw new HttpAuthenticationError(authentication.usernameRef.env);
  return { authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}` };
}
