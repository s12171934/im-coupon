import type { CouponRepository } from '../application/ports/coupon.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { Coupon } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';

import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { IssuanceError } from '../../issuance/domain/services/engine';

/** 발급된 쿠폰이 담기는 컬렉션. 시드에 없고 발급의 최초 쓰기가 이 파일을 만든다. */
const COUPONS_COLLECTION = 'coupons';

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
   * 컬렉션이 아직 없는 것은 실패가 아니다 — `JsonFileDb` 가 빈 배열로 읽는다.
   *
   * 배열인지는 여기서 확인한다. `JsonFileDb` 는 파싱 결과를 캐스트만 하고 모양을 보지
   * 않아, 손으로 고쳐 배열이 아니게 된 파일이 그대로 올라온다. 그냥 두면 `null`·`{}` 는
   * 퍼뜨릴 때 감싸지지 않은 `TypeError` 로 새고, 문자열은 글자로 쪼개져 거부 없이
   * 컬렉션을 오염시킨다 — 둘 다 읽기 실패이므로 같은 예외로 모은다.
   */
  private async read(): Promise<Coupon[]> {
    let rows: Coupon[];
    try {
      rows = await this.db.readCollection<Coupon>(COUPONS_COLLECTION);
    } catch (error) {
      throw new IssuanceError('STORAGE_FAILURE', `쿠폰 컬렉션을 읽지 못했다 — ${messageOf(error)}`);
    }
    if (!Array.isArray(rows)) {
      throw new IssuanceError('STORAGE_FAILURE', '쿠폰 컬렉션이 레코드 배열이 아니다');
    }
    return rows;
  }

  private async write(rows: readonly Coupon[]): Promise<void> {
    try {
      await this.db.writeCollection(COUPONS_COLLECTION, rows);
    } catch (error) {
      throw new IssuanceError('STORAGE_FAILURE', `쿠폰 컬렉션을 쓰지 못했다 — ${messageOf(error)}`);
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
