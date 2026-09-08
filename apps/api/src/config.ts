export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT는 1부터 65535까지의 정수여야 합니다.');
  }
  return { host: env.HOST ?? '127.0.0.1', port };
}
