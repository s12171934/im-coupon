import { readCollection } from '../../shared/infrastructure/read-collection';
import type { CouponRepository } from '../application/ports/coupon.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { Coupon } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';

import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { IssuanceError } from '../../issuance/domain/services/engine';

/** 발급된 쿠폰이 담기는 컬렉션. 시드에 없고 발급의 최초 쓰기가 이 파일을 만든다. */
const COUPONS_COLLECTION = 'coupons';

/**
 * 발급 시각 내림차순. 세 시각이 UTC `Z` 로 굳어 있으므로(7장) 문자열 비교가 곧 시각
 * 비교이고, `Date` 로 되돌릴 필요가 없다.
 *
 * 같은 시각에는 `0` 을 돌려 저장 순서를 그대로 남긴다. `Array.prototype.sort` 가 안정
 * 정렬이라 비교가 `0` 인 두 레코드의 앞뒤가 바뀌지 않기 때문이다. 저장은 뒤에 이어
 * 붙이므로 그 순서가 곧 발급 순서이고, 같은 밀리초 발급 2건은 겹친 요청 둘이 같은 시각을
 * 읽으면 실제로 난다 — 여기서 순서를 정해 두지 않으면 어느 쿠폰이 위에 오는지가 정렬
 * 구현에 매달린다.
 *
 * 그래서 오름차순으로 정렬한 뒤 뒤집지 않는다. 뒤집기는 안정 정렬이 지켜 준 동률 구간의
 * 앞뒤까지 함께 뒤집어, 같은 시각 2건이 발급 순서의 역순으로 나온다.
 */
function byIssuedAtDesc(left: Coupon, right: Coupon): number {
  if (left.issuedAt === right.issuedAt) return 0;
  return left.issuedAt < right.issuedAt ? 1 : -1;
}

/**
 * `coupons` 컬렉션의 유일한 출입구.
 *
 * 저장은 읽고-더하고-쓰는 한 묶음이라 겹치면 나중 쓰기가 앞 쓰기를 덮어 레코드가 유실된다.
 * `JsonFileDb` 의 원자적 쓰기는 파일이 반쯤 쓰인 상태만 막을 뿐 이 유실은 막지 못한다.
 * API 는 단일 프로세스이므로 그 묶음을 프로세스 안에서 한 줄로 세우면 충분하다 —
 * 프로세스 밖까지 막는 파일 락은 단독 점유 기획이 확정될 때의 몫이다.
 *
 * 다만 큐는 인스턴스별이라 "프로세스 안에서 한 줄"은 이 프로바이더가 프로세스에 하나만
 * 있다는 것에 매달린다. NestJS 프로바이더가 기본으로 싱글턴이므로 한 모듈에 한 번만
 * 등록하면 성립하고, 같은 데이터 디렉터리를 두고 인스턴스를 둘로 만들면 두 큐가 서로를
 * 모르는 채 겹쳐 이 보호가 조용히 풀린다. 등록하는 쪽이 지켜야 하는 조건이다.
 *
 * 파일 IO 실패는 `IssuanceError('STORAGE_FAILURE')` 로 감싸 올린다. 발급의 실패를
 * 반환값과 예외 둘로 가르지 않기 위한 것이다 — 엔진의 거부가 이미 이 예외로 오므로,
 * 여기서도 같은 예외로 맞춰야 API 층이 한 종류만 잡아 오류 응답으로 옮길 수 있다.
 */
@Injectable()
export class JsonCouponRepository implements CouponRepository {
  private readonly db: JsonFileDb;
  /** 직렬화 큐의 꼬리. 앞선 저장이 끝나야 다음 저장이 읽기부터 시작한다 */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  async append(coupon: Coupon): Promise<void> {
    await this.serialize(async () => {
      const rows = await this.read();
      await this.write([...rows, coupon]);
    });
  }

  /**
   * 한 소유자의 쿠폰을 발급 시각 내림차순으로 모은다 (8장).
   *
   * 직렬화 큐를 타지 않는다. 큐가 막는 것은 읽고-더하고-쓰기가 겹쳐 나는 유실인데 조회는
   * 쓰지 않고, `JsonFileDb` 의 쓰기가 rename 으로 끝나므로 저장과 겹쳐도 읽히는 것은 저장
   * 전이나 후의 파일 하나다. 조회를 큐에 세우면 앞선 저장이 끝날 때까지 기다리기만 한다.
   *
   * 거른 뒤에 정렬한다. 결과는 어느 쪽을 먼저 해도 같지만, 거르기가 앞서면 정렬이 다루는
   * 것이 늘 응답에 실릴 목록 그대로다.
   */
  async findByOwner(ownerId: string): Promise<Coupon[]> {
    const rows = await this.read();
    return rows.filter((coupon) => coupon.ownerId === ownerId).sort(byIssuedAtDesc);
  }

  private read(): Promise<Coupon[]> {
    return readCollection<Coupon>(this.db, COUPONS_COLLECTION);
  }

  private async write(rows: readonly Coupon[]): Promise<void> {
    try {
      await this.db.writeCollection(COUPONS_COLLECTION, rows);
    } catch (error) {
      throw new IssuanceError(
        'STORAGE_FAILURE',
        `쿠폰 컬렉션을 쓰지 못했다 — ${messageOf(error)}`,
      );
    }
  }

  /**
   * 앞선 작업이 끝난 뒤에 다음 작업을 시작시킨다.
   *
   * 꼬리에는 실패를 지운 약속을 남긴다. 실패한 저장이 꼬리에 그대로 남으면 뒤따르는
   * 저장이 자기와 무관한 실패로 줄줄이 거부되고, 그 거부를 아무도 받지 않아 처리되지 않은
   * 거부까지 된다. 실패는 그 저장을 부른 쪽에만 돌려준다.
   */
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const done = this.tail.then(work);
    this.tail = done.then(
      () => undefined,
      () => undefined,
    );
    return done;
  }
}

/** 감싼 예외가 원인을 삼키지 않게 원래 오류의 말을 메시지에 남긴다. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
