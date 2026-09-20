import type { CollectionDefinition } from './types';

const PROCESS_CONTROL_ENVIRONMENT = new Set([
  'NODE_OPTIONS', 'NODE_PATH',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT',
  'LIBPATH', 'SHLIB_PATH',
  'OPENSSL_CONF', 'OPENSSL_MODULES',
]);

function credentialNames(definition: CollectionDefinition): string[] {
  if (!('connection' in definition) || !('auth' in definition.connection) || !definition.connection.auth) return [];
  const auth = definition.connection.auth;
  if (auth.type === 'apiKey') return [auth.valueRef.env];
  if (auth.type === 'bearer') return [auth.tokenRef.env];
  return [auth.usernameRef.env, auth.passwordRef.env];
}

/** scheduled child의 실행 의미를 바꿀 수 없는 수집 credential 이름만 반환한다. */
export function scheduledCredentialEnvironment(definition: CollectionDefinition): readonly string[] {
  const names = credentialNames(definition);
  if (names.some(name => PROCESS_CONTROL_ENVIRONMENT.has(name) || name.startsWith('DYLD_'))) {
    throw new Error('scheduled collection credential environment name is not allowed');
  }
  return names;
}
