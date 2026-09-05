import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { JsonFileDb } from '@im-coupon/db';

import { AppModule } from './app.module';
import { resolveDataDir, resolveSeedDir } from './data-dir';
import { resolveGuardDir, watchForOrphan } from './orphan-guard';
import { explainPortInUse } from './port-in-use';

const PORT = Number(process.env.PORT ?? 3000);

/** 자기 소스가 사라진 프로세스는 포트만 붙들 뿐이므로 스스로 물러난다. */
function guardAgainstOrphan(): void {
  watchForOrphan({
    dir: resolveGuardDir(__dirname),
    onOrphan: (dir) => {
      console.error(`[im-coupon] 소스 디렉터리가 사라졌습니다: ${dir}`);
      console.error('[im-coupon] 고아 프로세스로 판단해 종료합니다.');
      process.exit(1);
    },
  });
}

async function bootstrap(): Promise<void> {
  guardAgainstOrphan();

  await new JsonFileDb(resolveDataDir()).bootstrapFromSeed(resolveSeedDir());

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();

  try {
    await app.listen(PORT);
  } catch (error) {
    const explanation = explainPortInUse(error, PORT);
    if (explanation === null) throw error;
    console.error(`[im-coupon] ${explanation}`);
    process.exit(1);
  }
}

void bootstrap();
