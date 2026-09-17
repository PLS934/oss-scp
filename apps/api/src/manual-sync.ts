import { randomUUID } from 'node:crypto';
import {
  ConflictException, Controller, ForbiddenException, Get, HttpCode, Inject, Injectable,
  NotFoundException, OnApplicationShutdown, Param, Post, ServiceUnavailableException,
} from '@nestjs/common';
import { executeManualCollection, type CliOutcome } from '@oss-scp/collector-cli';
import type { RecordQuery } from '@oss-scp/platform-db';
import { PLUGIN_RUNTIME_REGISTRY, type PluginRuntimeRegistry } from './plugin-runtime-registry';
import { RECORD_QUERY } from './record-query.service';

export const MANUAL_SYNC_AUTHORIZER = Symbol('MANUAL_SYNC_AUTHORIZER');
export const MANUAL_SYNC_CONFIG_ROOT = Symbol('MANUAL_SYNC_CONFIG_ROOT');
export const MANUAL_SYNC_EXECUTOR = Symbol('MANUAL_SYNC_EXECUTOR');

export interface ManualSyncAuthorizer { canExecute(): boolean | Promise<boolean> }
export class AccountManagementDisabledAuthorizer implements ManualSyncAuthorizer { canExecute() { return true; } }

export type ManualSyncState = 'accepted' | 'running' | 'success' | 'partial' | 'failed';
export interface ManualSyncRequest {
  requestId: string;
  pluginId: string;
  status: ManualSyncState;
  runId: string | null;
  startedAt: string;
  finishedAt: string | null;
  errorCode: 'COLLECTION_FAILED' | null;
}
export type ManualSyncExecutor = (pluginId: string, signal: AbortSignal, requestId?: string) => Promise<CliOutcome>;

const publicErrors = {
  forbidden: { code: 'SYNC_FORBIDDEN', message: '동기화를 실행할 권한이 없습니다.' },
  unavailable: { code: 'PLUGIN_UNAVAILABLE', message: '동기화할 수 있는 플러그인이 아닙니다.' },
  noTargets: { code: 'NO_ACTIVE_TARGETS', message: '활성화된 수집 대상이 없습니다.' },
  active: { code: 'SYNC_ALREADY_RUNNING', message: '이 플러그인의 동기화가 이미 진행 중입니다.' },
  missing: { code: 'SYNC_REQUEST_NOT_FOUND', message: '동기화 요청을 찾을 수 없습니다.' },
  failed: { code: 'SYNC_STATUS_FAILED', message: '동기화 상태를 확인할 수 없습니다.' },
} as const;

@Injectable()
export class ManualSyncManager implements OnApplicationShutdown {
  private readonly requests = new Map<string, ManualSyncRequest>();
  private readonly activeByPlugin = new Map<string, string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly terminalOrder: string[] = [];
  private readonly terminalTtlMs = 60 * 60 * 1000;

  constructor(
    @Inject(PLUGIN_RUNTIME_REGISTRY) private readonly registry: PluginRuntimeRegistry,
    @Inject(RECORD_QUERY) private readonly query: RecordQuery,
    @Inject(MANUAL_SYNC_EXECUTOR) private readonly execute: ManualSyncExecutor,
  ) {}

  private definitions(pluginId: string) { return this.registry.definitions.filter(value => value.plugin.id === pluginId); }
  private prune() {
    const cutoff = Date.now() - this.terminalTtlMs;
    while (this.terminalOrder.length > 0) {
      const requestId = this.terminalOrder[0]!; const request = this.requests.get(requestId);
      if (this.terminalOrder.length <= 100 && (!request?.finishedAt || Date.parse(request.finishedAt) >= cutoff)) break;
      this.terminalOrder.shift(); this.requests.delete(requestId);
    }
  }

  async capability(pluginId: string) {
    const menu = this.registry.menus.find(value => value.pluginId === pluginId);
    const definitions = this.definitions(pluginId);
    if (!menu && definitions.length === 0) return { pluginId, available: false, canExecute: false, reason: publicErrors.unavailable.code, currentRun: null, lastSuccessAt: null };
    if (definitions.length === 0) return { pluginId, available: true, canExecute: false, reason: publicErrors.noTargets.code, currentRun: null, lastSuccessAt: null };
    let collection = null;
    if (menu) {
      const result = await this.query.listRecords({ pluginId, sourceId: menu.sourceId, dataType: menu.dataType, limit: 20 });
      collection = result.collection;
    }
    const local = this.activeByPlugin.get(pluginId);
    const running = local ? this.requests.get(local) : undefined;
    return {
      pluginId, available: true, canExecute: !running && collection?.status !== 'running', reason: running || collection?.status === 'running' ? publicErrors.active.code : null,
      currentRun: running ? { requestId: running.requestId, runId: running.runId, status: running.status, startedAt: running.startedAt }
        : collection?.status === 'running' ? { requestId: null, runId: collection.runId, status: 'running', startedAt: collection.startedAt } : null,
      lastSuccessAt: menu && this.query.getLastSuccessAt ? await this.query.getLastSuccessAt(pluginId, menu.sourceId) : collection?.status === 'success' ? collection.finishedAt : null,
    };
  }

  async start(pluginId: string): Promise<ManualSyncRequest> {
    this.prune();
    const definitions = this.definitions(pluginId);
    const known = definitions.length > 0 || this.registry.menus.some(value => value.pluginId === pluginId);
    if (!known) throw new NotFoundException(publicErrors.unavailable);
    if (definitions.length === 0) throw new ConflictException(publicErrors.noTargets);
    const capability = await this.capability(pluginId);
    if (!capability.canExecute) throw new ConflictException({ ...publicErrors.active, currentRun: capability.currentRun });
    const requestId = randomUUID();
    const startedAt = new Date().toISOString();
    const request: ManualSyncRequest = { requestId, pluginId, status: 'accepted', runId: null, startedAt, finishedAt: null, errorCode: null };
    this.requests.set(requestId, request);
    this.activeByPlugin.set(pluginId, requestId);
    const controller = new AbortController(); this.controllers.set(requestId, controller);
    queueMicrotask(() => { void this.run(requestId, pluginId, controller); });
    return { ...request };
  }

  private async run(requestId: string, pluginId: string, controller: AbortController) {
    const request = this.requests.get(requestId); if (!request) return;
    request.status = 'running';
    let outcome: CliOutcome;
    try { outcome = await this.execute(pluginId, controller.signal, requestId); }
    catch { outcome = { exitCode: 3, status: 'failed', pluginId, errorCode: 'collection_failed' }; }
    request.finishedAt = new Date().toISOString();
    if ('result' in outcome) { request.status = outcome.status; request.runId = outcome.result.runId; }
    else { request.status = 'failed'; request.errorCode = 'COLLECTION_FAILED'; }
    this.activeByPlugin.delete(pluginId); this.controllers.delete(requestId);
    this.terminalOrder.push(requestId);
    this.prune();
  }

  get(requestId: string) { this.prune(); const request = this.requests.get(requestId); if (!request) throw new NotFoundException(publicErrors.missing); return request; }
  async onApplicationShutdown() { for (const controller of this.controllers.values()) controller.abort(); }
}

@Injectable()
export class ManualSyncService {
  constructor(
    @Inject(MANUAL_SYNC_AUTHORIZER) private readonly authorizer: ManualSyncAuthorizer,
    private readonly manager: ManualSyncManager,
  ) {}
  private async authorize() { if (!await this.authorizer.canExecute()) throw new ForbiddenException(publicErrors.forbidden); }
  async start(pluginId: string) { await this.authorize(); return this.manager.start(pluginId); }
  async get(requestId: string) { await this.authorize(); return this.manager.get(requestId); }
  async capability(pluginId: string) { await this.authorize(); try { return await this.manager.capability(pluginId); } catch { throw new ServiceUnavailableException(publicErrors.failed); } }
}

@Controller('api/v1')
export class ManualSyncController {
  constructor(private readonly sync: ManualSyncService) {}
  @Post('plugins/:pluginId/sync-runs') @HttpCode(202) start(@Param('pluginId') pluginId: string) { return this.sync.start(pluginId); }
  @Get('sync-runs/:requestId') get(@Param('requestId') requestId: string) { return this.sync.get(requestId); }
  @Get('plugins/:pluginId/sync') capability(@Param('pluginId') pluginId: string) { return this.sync.capability(pluginId); }
}

export function manualSyncExecutor(configRoot: string): ManualSyncExecutor {
  return (pluginId, signal, requestId) => executeManualCollection({ args: [pluginId], root: configRoot, env: process.env, signal, trigger: 'api', requestId });
}
