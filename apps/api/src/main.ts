import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { JsonFileDb } from '@im-coupon/db';

import { AppModule } from './app.module';
import { resolveDataDir, resolveSeedDir } from './data-dir';

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap(): Promise<void> {
  await new JsonFileDb(resolveDataDir()).bootstrapFromSeed(resolveSeedDir());

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  await app.listen(PORT);
}

void bootstrap();
