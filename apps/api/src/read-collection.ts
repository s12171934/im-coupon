import type { JsonFileDb } from '@im-coupon/db';

import { IssuanceError } from './issuance/engine';

/**
 * 컬렉션 하나를 레코드 배열로 읽는다 — 파일 IO 실패를 `IssuanceError` 로 옮기는 자리.
 *
 * 컬렉션이 아직 없는 것은 실패가 아니다. `JsonFileDb` 가 없는 컬렉션을 빈 배열로 읽으므로,
 * 시드 부트스트랩 전의 디렉터리나 발급 전의 `coupons` 는 오류가 아니라 0건이다.
 *
 * 배열인지는 여기서 확인한다. `JsonFileDb` 는 파싱 결과를 캐스트만 하고 모양을 보지 않아,
 * 손으로 고쳐 배열이 아니게 된 파일이 그대로 올라온다. 그냥 두면 `null`·`{}` 는 순회나
 * 퍼뜨리기에서 감싸지지 않은 `TypeError` 로 새고, 문자열은 글자 하나하나가 레코드 행세를
 * 해 거부 없이 컬렉션을 오염시킨다 — 둘 다 읽기 실패이므로 같은 예외로 모은다.
 *
 * 읽는 쪽마다 이 셋을 따로 쓰지 않고 한 함수로 모은 것은, 갈라 두면 컬렉션에 따라 무엇이
 * 실패로 잡히는지가 조용히 달라지기 때문이다. 실패의 표현을 `IssuanceError` 하나로 모으는
 * 것이 이 저장소의 규칙이고(4장 결정 11), 그 규칙을 지키는 자리도 하나면 된다.
 *
 * 감싼 예외가 원인을 삼키지 않게 원 오류의 말을 메시지에 남긴다. 그 말을 응답에 내보일지
 * 가릴지는 오류 필터 한 곳이 정한다.
 */
export async function readCollection<T>(db: JsonFileDb, collection: string): Promise<T[]> {
  let rows: T[];
  try {
    rows = await db.readCollection<T>(collection);
  } catch (error) {
    throw new IssuanceError(
      'STORAGE_FAILURE',
      `${collection} 컬렉션을 읽지 못했다 — ${messageOf(error)}`,
    );
  }
  if (!Array.isArray(rows)) {
    throw new IssuanceError('STORAGE_FAILURE', `${collection} 컬렉션이 레코드 배열이 아니다`);
  }
  return rows;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
