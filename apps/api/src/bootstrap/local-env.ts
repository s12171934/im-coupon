import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

// src/bootstrap와 dist/bootstrap 모두 apps/api/.env를 읽는다.
// 이미 주입된 환경변수는 Node의 loadEnvFile이 보존한다.
try {
  loadEnvFile(resolve(__dirname, '../../.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw new Error('API 환경변수 파일을 읽지 못했습니다. apps/api/.env 권한과 형식을 확인해 주세요.');
  }
}
