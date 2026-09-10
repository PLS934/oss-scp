export type PlatformDbTls =
  | { mode: 'disable' }
  | { mode: 'verify-full'; ca?: string };

/** 비밀번호를 포함한다. 전체 설정을 로그·응답에 전달하지 않는다. */
export interface PlatformDbConfig {
  type: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolMax: number;
  connectTimeoutMs: number;
  tls: PlatformDbTls;
}

export interface PlatformDbConnection {
  /** connectTimeoutMs 안에 준비 상태를 반환한다. DB 장애는 false로 표현한다. */
  checkReady(): Promise<boolean>;
  /** 반복 호출 가능하며 연결 실패 시 생성한 자원도 정리해야 한다. */
  close(): Promise<void>;
}

/** 실제 연결·TLS 체인/호스트 검증·풀·timeout은 제품별 구현 책임이다. */
export interface PlatformDbAdapterFactory {
  readonly id: string;
  readonly contractVersion: 1;
  readonly defaultPort: number;
  connect(config: PlatformDbConfig): Promise<PlatformDbConnection>;
}
