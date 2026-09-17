import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { isLivePostgresDefinition, type CollectionDefinition } from '@oss-scp/plugin-config';

const localRequire = createRequire(__filename);

export interface StartupCollectionLogger {
  error(message: string): void;
}
export type SpawnCollectionProcess = (pluginId: string, configRoot: string, processPath: string) => ChildProcess;

const defaultSpawn: SpawnCollectionProcess = (pluginId, configRoot, processPath) => spawn(process.execPath, [processPath, pluginId], {
  env: { ...process.env, OSS_SCP_CONFIG_ROOT: configRoot, OSS_SCP_COLLECTION_TRIGGER: 'startup' },
  stdio: ['ignore', 'ignore', 'pipe'],
});

export class StartupCollectionManager {
  private readonly children = new Set<ChildProcess>();
  private closing = false;

  constructor(
    private readonly configRoot: string,
    private readonly logger: StartupCollectionLogger = console,
    private readonly processPath = localRequire.resolve('@oss-scp/collector-cli/dist/process.js'),
    private readonly spawnProcess: SpawnCollectionProcess = defaultSpawn,
  ) {}

  start(definitions: readonly CollectionDefinition[]): void {
    if (this.closing) return;
    for (const definition of definitions) {
      if (isLivePostgresDefinition(definition)) continue;
      let child: ChildProcess;
      try {
        child = this.spawnProcess(definition.plugin.id, this.configRoot, this.processPath);
      } catch {
        this.logger.error(`기동 수집 프로세스를 시작하지 못했습니다: ${definition.plugin.id}`);
        continue;
      }
      this.children.add(child);
      let spawnFailed = false;
      child.stderr?.resume();
      child.once('error', () => {
        spawnFailed = true;
        this.logger.error(`기동 수집 프로세스를 시작하지 못했습니다: ${definition.plugin.id}`);
      });
      child.once('close', (code) => {
        this.children.delete(child);
        if (!spawnFailed && code !== 0 && code !== 2 && !this.closing) {
          this.logger.error(`기동 수집 실패: ${definition.plugin.id}`);
        }
      });
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    const children = [...this.children];
    for (const child of children) child.kill('SIGTERM');
    await Promise.all(children.map(child => new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('close', () => resolve());
    })));
  }
}
