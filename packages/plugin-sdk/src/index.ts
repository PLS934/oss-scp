export interface TransformContext {
  readonly pluginId: string;
  readonly sourceId: string;
  readonly collectedAt: string;
  readonly responseMetadata?: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
}

export interface TransformInput {
  readonly record: unknown;
  readonly context: Readonly<TransformContext>;
}

export interface TransformRecord {
  type: string;
  values: Record<string, unknown>;
}

export interface RecordReference {
  type: string;
  key: string | number;
}

export interface TransformRelation {
  type: string;
  from: RecordReference;
  to: RecordReference;
}

export interface TransformOutput {
  records: TransformRecord[];
  relations?: TransformRelation[];
}

export type Transform = (input: TransformInput) => TransformOutput | Promise<TransformOutput>;
