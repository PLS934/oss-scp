const messages = {
  REQUIRED: '필수 설정이 필요합니다.',
  INVALID_TEXT: '빈 값, 앞뒤 공백, 제어문자 또는 잘못된 주소 형식을 사용할 수 없습니다.',
  INVALID_PORT: '포트는 1~65535의 십진 정수여야 합니다.',
  INVALID_POOL_MAX: '연결 수는 1~100의 십진 정수여야 합니다.',
  INVALID_TIMEOUT: '연결 대기 시간은 1~60000의 십진 정수여야 합니다.',
  PASSWORD_SOURCE: '비밀번호 값과 파일 중 정확히 하나를 지정해야 합니다.',
  INVALID_PASSWORD: '비밀번호는 비어 있지 않은 최대 16 KiB 값이며 CR/LF·NUL을 포함할 수 없습니다.',
  INVALID_FILE: '절대 경로의 읽을 수 있는 일반 UTF-8 파일과 크기 제한을 확인하세요.',
  INVALID_TLS: 'TLS 모드는 disable 또는 verify-full이어야 합니다.',
  TLS_CA_CONFLICT: 'CA 파일은 verify-full 모드에서만 사용할 수 있습니다.',
  INVALID_CA: '유효한 PEM 인증서 파일이 필요합니다.',
  INVALID_ADAPTER: '어댑터 ID·계약 버전·기본 포트·연결 함수를 확인하세요.',
  DUPLICATE_ADAPTER: '중복된 어댑터 ID를 등록할 수 없습니다.',
  UNREGISTERED_ADAPTER: '등록된 DB 종류만 선택할 수 있습니다.',
} as const;

export type PlatformDbErrorCode = keyof typeof messages;
export type PlatformDbSetting =
  | 'PLATFORM_DB_TYPE' | 'PLATFORM_DB_HOST' | 'PLATFORM_DB_PORT'
  | 'PLATFORM_DB_NAME' | 'PLATFORM_DB_USER' | 'PLATFORM_DB_PASSWORD'
  | 'PLATFORM_DB_PASSWORD_FILE' | 'PLATFORM_DB_POOL_MAX'
  | 'PLATFORM_DB_CONNECT_TIMEOUT_MS' | 'PLATFORM_DB_TLS_MODE'
  | 'PLATFORM_DB_TLS_CA_FILE' | 'adapters';

/** 입력값이나 원본 파일 시스템 오류를 보관하지 않는 공개 오류. */
export class PlatformDbConfigError extends Error {
  constructor(readonly code: PlatformDbErrorCode, readonly setting: PlatformDbSetting) {
    super(`${setting}: ${messages[code]}`);
    this.name = 'PlatformDbConfigError';
  }
}

/** DB 제품과 무관하게 비밀정보·드라이버 cause를 보관하지 않는 연결 오류. */
export class PlatformDbConnectionError extends Error {
  constructor(readonly code: 'CONNECT_FAILED' | 'CONNECTION_CLOSED') {
    super(code === 'CONNECT_FAILED' ? '플랫폼 DB에 연결할 수 없습니다.' : '플랫폼 DB 연결이 종료되었습니다.');
    this.name = 'PlatformDbConnectionError';
  }
}
