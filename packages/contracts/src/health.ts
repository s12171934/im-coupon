/** 저장소(JSON 파일 DB) 자체의 상태. 도메인 데이터가 아니라 저장 계층이 살아 있는지를 말한다. */
export interface StorageHealth {
  /** 데이터 디렉터리를 읽을 수 있었는지 */
  readable: boolean;
  /** 시드 데이터가 선언한 스키마 판. 읽지 못하면 null */
  schemaVersion: number | null;
  /** 데이터 디렉터리에서 발견된 컬렉션 이름 */
  collections: string[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  storage: StorageHealth;
}

export const HEALTH_PATH = '/api/health' as const;
