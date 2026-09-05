import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StorageHealth } from '@im-coupon/contracts';

const EXTENSION = '.json';
/** 도메인 컬렉션이 아니라 시드 자체를 설명하는 예약 컬렉션 */
const META_COLLECTION = '_meta';

/**
 * 저장소의 유일한 영속화 수단인 JSON 파일 DB.
 *
 * 컬렉션 하나가 파일 하나(`<name>.json`)에 대응하고, 파일 하나에는 레코드 배열이 담긴다.
 * 쓰기는 임시 파일에 먼저 기록한 뒤 원자적으로 rename 한다. 프로세스가 쓰기 도중 죽어도
 * 원본 파일이 반쯤 쓰인 상태로 남지 않게 하기 위한 것이다.
 */
export class JsonFileDb {
  constructor(private readonly dataDir: string) {}

  async listCollections(): Promise<string[]> {
    const entries = await readdir(this.dataDir);
    return entries
      .filter((name) => name.endsWith(EXTENSION))
      .map((name) => name.slice(0, -EXTENSION.length))
      .sort();
  }

  /** 컬렉션이 아직 없으면 빈 배열이다. 없는 것과 비어 있는 것을 구분하지 않는다. */
  async readCollection<T>(name: string): Promise<T[]> {
    let raw: string;
    try {
      raw = await readFile(this.pathOf(name), 'utf8');
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    return JSON.parse(raw) as T[];
  }

  async writeCollection<T>(name: string, rows: readonly T[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const target = this.pathOf(name);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  }

  /**
   * 저장 계층이 살아 있는지 점검한다. 도메인 데이터를 해석하지 않고
   * 디렉터리를 읽을 수 있는지와 시드가 선언한 스키마 판만 본다.
   */
  async checkHealth(): Promise<StorageHealth> {
    let collections: string[];
    try {
      collections = await this.listCollections();
    } catch (error) {
      if (isNotFound(error)) return { readable: false, schemaVersion: null, collections: [] };
      throw error;
    }

    const meta = await this.readMeta();

    return {
      readable: true,
      schemaVersion: meta?.schemaVersion ?? null,
      collections: collections.filter((name) => name !== META_COLLECTION),
    };
  }

  /**
   * 런타임 디렉터리가 비어 있을 때만 시드를 복사한다.
   * 시연 중 쌓인 런타임 데이터를 재기동이 지우지 않게 하기 위한 조건이다.
   */
  async bootstrapFromSeed(seedDir: string): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    if ((await this.listCollections()).length > 0) return;
    await cp(seedDir, this.dataDir, { recursive: true });
  }

  /** `_meta.json` 은 레코드 배열이 아니라 시드를 설명하는 객체 하나다. */
  private async readMeta(): Promise<{ schemaVersion?: number } | null> {
    try {
      const raw = await readFile(this.pathOf(META_COLLECTION), 'utf8');
      return JSON.parse(raw) as { schemaVersion?: number };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  private pathOf(name: string): string {
    return join(this.dataDir, `${name}${EXTENSION}`);
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
