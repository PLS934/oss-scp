import { Client, InvalidCredentialsError, type Entry } from 'ldapts';
import { connect as tlsConnect, type ConnectionOptions } from 'node:tls';
import type { EnabledAuthConfig } from './auth-config';

export interface AuthenticatedIdentity { userId: string; loginId: string }

export class AuthenticationError extends Error {
  constructor(readonly code: 'INVALID_CREDENTIALS' | 'AUTH_SERVICE_UNAVAILABLE') {
    super(code);
    this.name = 'AuthenticationError';
  }
}

export interface LdapClient {
  startTLS(options: { rejectUnauthorized: true; servername: string; ca?: string }): Promise<void>;
  bind(dn: string, password: string): Promise<void>;
  search(baseDn: string, options: { scope: 'sub'; filter: string; attributes: string[]; explicitBufferAttributes: string[]; sizeLimit: number; timeLimit: number }): Promise<{ searchEntries: Entry[] }>;
  unbind(): Promise<void>;
}

export type LdapClientFactory = (options: { url: string; timeout: number; connectTimeout: number; tlsOptions: { rejectUnauthorized: true; servername: string; ca?: string } }) => LdapClient;

const startTlsConnection = ((options: ConnectionOptions) => {
  // The plain socket can still be flowing after the LDAP extended-operation response.
  // Pause it before handing ownership to TLSSocket so no handshake bytes are consumed there.
  options.socket?.pause();
  return tlsConnect(options);
}) as typeof tlsConnect;

export const ldapClientFactory: LdapClientFactory = options => {
  if (!options.url.startsWith('ldap://')) return new Client(options);
  return new Client({
    url: options.url,
    timeout: options.timeout,
    connectTimeout: options.connectTimeout,
    createSecureConnection: startTlsConnection,
  });
};

export function escapeLdapFilterValue(value: string): string {
  let escaped = '';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (character === '*') escaped += '\\2a';
    else if (character === '(') escaped += '\\28';
    else if (character === ')') escaped += '\\29';
    else if (character === '\\') escaped += '\\5c';
    else if (code === 0) escaped += '\\00';
    else escaped += character;
  }
  return escaped;
}

const MAX_USER_ID_LENGTH = 512;

function validNormalizedId(value: string): string | undefined {
  return value && [...value].length <= MAX_USER_ID_LENGTH && !hasControlCharacter(value) ? value : undefined;
}

function normalizedId(value: Entry[string] | undefined): string | undefined {
  if (Buffer.isBuffer(value)) return validNormalizedId(value.toString('base64url'));
  if (typeof value === 'string') return validNormalizedId(value);
  if (Array.isArray(value) && value.length === 1) {
    const first: Buffer | string = value[0];
    if (Buffer.isBuffer(first)) return validNormalizedId(first.toString('base64url'));
    return validNormalizedId(first);
  }
  return undefined;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function hasPasswordControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0)!;
    return (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) || (code >= 0x7f && code <= 0x9f);
  });
}

function invalidCredentials(error: unknown): boolean {
  return error instanceof InvalidCredentialsError || (error instanceof Error && error.name === 'InvalidCredentialsError');
}

export class LdapAuthenticator {
  constructor(private readonly config: EnabledAuthConfig['ldap'], private readonly createClient: LdapClientFactory = ldapClientFactory) {}

  private client(): LdapClient {
    const tlsOptions = { rejectUnauthorized: true as const, servername: new URL(this.config.url).hostname, ...(this.config.ca === undefined ? {} : { ca: this.config.ca }) };
    return this.createClient({ url: this.config.url, timeout: this.config.timeoutMs, connectTimeout: this.config.timeoutMs, tlsOptions });
  }

  private async secure(client: LdapClient): Promise<void> {
    if (this.config.url.startsWith('ldap://')) {
      const options = { rejectUnauthorized: true as const, servername: new URL(this.config.url).hostname, ...(this.config.ca === undefined ? {} : { ca: this.config.ca }) };
      await client.startTLS(options);
    }
  }

  async authenticate(rawLoginId: string, password: string): Promise<AuthenticatedIdentity> {
    const loginId = rawLoginId.trim();
    if (!loginId || loginId.length > 256 || hasControlCharacter(loginId)
      || !password || password.length > 4096 || hasPasswordControlCharacter(password)) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }

    const client = this.client();
    try {
      await this.secure(client);
      await client.bind(this.config.bindDn, this.config.bindPassword);
      const result = await client.search(this.config.searchBaseDn, {
        scope: 'sub',
        filter: this.config.searchFilter.replace('{{login}}', escapeLdapFilterValue(loginId)),
        attributes: [this.config.userIdAttribute],
        explicitBufferAttributes: [this.config.userIdAttribute],
        sizeLimit: 2,
        timeLimit: Math.max(1, Math.ceil(this.config.timeoutMs / 1000)),
      });
      if (result.searchEntries.length !== 1) throw new AuthenticationError('INVALID_CREDENTIALS');
      const entry = result.searchEntries[0];
      const userId = normalizedId(entry[this.config.userIdAttribute]);
      if (!userId) throw new AuthenticationError('INVALID_CREDENTIALS');
      try {
        await client.bind(entry.dn, password);
      } catch (error) {
        throw new AuthenticationError(invalidCredentials(error) ? 'INVALID_CREDENTIALS' : 'AUTH_SERVICE_UNAVAILABLE');
      }
      return { userId, loginId };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('AUTH_SERVICE_UNAVAILABLE');
    } finally { await client.unbind().catch(() => undefined); }
  }
}
