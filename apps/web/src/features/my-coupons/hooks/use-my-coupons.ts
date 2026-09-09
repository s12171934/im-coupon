import { useEffect, useState } from 'react';
import {
  COUPONS_PATH,
  OWNER_ID_QUERY,
  type ApiErrorResponse,
  type BenefitSplit,
  type IssuedCoupon,
  type IssuedCouponStatus,
  type ListCouponsResponse,
} from '@im-coupon/contracts';

/**
 * 오류 영역에 실을 실패 하나. `code` 를 `ApiErrorCode` 로 좁히지 않는다 — 계약 밖 응답과
 * 네트워크 실패도 같은 자리에 실려야 하고, `ErrorNotice` 의 `code` 가 그래서 `string` 이다.
 *
 * 시민 목록 훅(`CP-06-03`)의 실패 타입과 필드가 같지만 그것을 가져다 쓰지 않는다. 형제
 * 훅끼리 타입을 빌리면 둘 중 한쪽이 자기 실패 모양을 바꿀 때 다른 쪽이 함께 끌려간다.
 * 두 훅이 실제로 맞물리는 자리는 `ErrorNotice` 의 props 뿐이고, 그 짝은 이름이 아니라
 * 필드 모양으로 맞는다.
 */
export interface MyCouponsFailure {
  code: string;
  message: string;
}

/**
 * 내 쿠폰 조회의 상태. 판별 유니온이라 모순 조합(조회 중인데 결과가 있음, 성공과 실패가
 * 함께 남음)이 아예 표현되지 않는다 — 시민 목록 조회(`CP-06-03`)가 같은 이유로 고른 모양이다.
 *
 * `'unselected'` 갈래가 시민 목록 쪽에는 없는 자리다. 소유자 선택(`CP-06-01`)은 아무도
 * 고르지 않은 상태를 `null` 로 올리는데, 그 값으로 조회하면 서버가 `MISSING_OWNER_ID` 로
 * 거부한다. 그것은 서버가 낼 오류이지 화면이 스스로 만들어 낼 상태가 아니므로, 조회하지
 * 않는 이 상태를 실패나 빈 목록으로 뭉치지 않고 갈래 하나로 세운다.
 */
export type MyCouponsState =
  | { status: 'unselected' }
  | { status: 'loading' }
  | { status: 'loaded'; coupons: IssuedCoupon[] }
  | { status: 'failed'; error: MyCouponsFailure };

export interface UseMyCoupons {
  state: MyCouponsState;
}

/** 계약 밖 응답. 계약의 여섯 코드와 겹치지 않게 두어 오류 영역의 안내가 거짓말하지 않는다. */
const UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE';
/** 요청이 응답에 닿지 못한 실패. 서버가 내지 않은 코드이므로 계약의 여섯을 빌려 쓰지 않는다. */
const NETWORK_FAILURE = 'NETWORK_FAILURE';

/**
 * 내 쿠폰 화면의 쿠폰 목록 조회 (`CP-06-04`, 설계문서 4장 결정 10 — 로직은 훅이 진다).
 * 상태만 돌려준다 — 무엇을 그릴지는 화면 조립(`CP-06-05`)이 정한다.
 *
 * 선택된 소유자 id 를 훅이 들지 않고 인자로 받는다. 그 상태가 앉을 자리는 소유자
 * 선택(`CP-06-01`)과 이 훅을 잇는 조립 층이다 (결정 10 — 둘을 잇는 폼 상태는 조립의 몫).
 *
 * 다시 조회하는 함수를 두지 않는다. 재조회의 트리거는 소유자가 바뀌는 것 하나뿐이고,
 * 그것은 이미 인자로 들어온다 — 마운트 한 번으로 끝나는 시민 목록 훅과 갈리는 지점이다.
 */
export function useMyCoupons(ownerId: string | null): UseMyCoupons {
  const [state, setState] = useState<MyCouponsState>(() => initialState(ownerId));

  useEffect(() => {
    if (ownerId === null) {
      setState({ status: 'unselected' });
      return;
    }

    /*
      늦게 도착한 앞 소유자의 응답이 뒤에 온 선택을 덮지 않게 막는다.

      이 가드 하나로 닫히는지 확인했고, 닫힌다 — 다만 그 근거는 의존 배열에 있다.
      정리 함수는 언마운트뿐 아니라 **의존이 바뀔 때도** 실행되므로, 소유자가 A 에서 B 로
      바뀌면 React 가 A 의 정리를 먼저 돌리고(그 실행의 `cancelled` 가 참이 된다) 그다음
      B 의 실행을 시작한다. 실행마다 `cancelled` 바인딩이 새로 만들어지니 A 의 응답은
      자기 실행의 참이 된 값을, B 의 응답은 자기 실행의 거짓인 값을 본다. 그래서 도착
      순서가 뒤집혀도 A 는 스스로 물러나고 B 만 상태에 남는다.

      의존 배열이 `[]` 인 형제 훅(`use-storage-health.ts`·`use-citizens.ts`)에서 이 가드가
      언마운트만 막는 것은 그쪽 효과가 애초에 다시 실행되지 않아서다. 가드가 약한 것이
      아니라 막을 일이 없는 것이고, 여기서는 `[ownerId]` 가 그 재실행을 만들어 준다.
    */
    let cancelled = false;
    /*
      새 소유자의 조회를 시작하면서 앞 소유자의 쿠폰을 걷는다. 그대로 두고 새 조회를 하면
      사용자가 B 를 고른 화면에 A 의 쿠폰이 남아, 그것을 B 의 쿠폰으로 읽는다. 쿠폰 카드가
      진 거래조건 고지가 남의 레코드를 자기 것으로 보이게 하는 것이라 더욱 남길 수 없다.
      앞 소유자의 실패가 새 선택 아래 남지 않는 것도 같은 갱신이 함께 처리한다.
    */
    setState({ status: 'loading' });
    requestMyCoupons(ownerId).then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  return { state };
}

/** 첫 렌더의 상태. 소유자가 이미 정해져 있으면 조회가 곧 시작되므로 조회 중으로 연다. */
function initialState(ownerId: string | null): MyCouponsState {
  return ownerId === null ? { status: 'unselected' } : { status: 'loading' };
}

async function requestMyCoupons(ownerId: string): Promise<MyCouponsState> {
  let response: Response;
  try {
    response = await fetch(couponsUrl(ownerId));
  } catch {
    return {
      status: 'failed',
      error: {
        code: NETWORK_FAILURE,
        message: '쿠폰 목록 요청이 서버에 닿지 못했습니다. 네트워크와 서버 상태를 확인하세요.',
      },
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return unexpectedResponse(response.status);
  }

  if (response.ok) {
    const coupons = couponListOf(body);
    return coupons === undefined
      ? unexpectedResponse(response.status)
      : { status: 'loaded', coupons };
  }
  const error = contractErrorOf(body);
  /* 서버 메시지를 화면이 다시 쓰지 않는다 — `STORAGE_FAILURE` 문구는 서버가 일부러 가린 것이다. */
  return error === undefined ? unexpectedResponse(response.status) : { status: 'failed', error };
}

/**
 * 소유자 id 를 실은 내 쿠폰 조회 URL (설계문서 8장).
 *
 * 쿼리를 문자열 접합으로 만들지 않는다. 시민 id 는 정확 일치로 다루는 값인데, 접합하면
 * `&`·`=`·공백이 든 id 가 쿼리 구조를 바꿔 서버에 다른 값으로 닿는다 — `cit&001` 은
 * `cit` 으로 잘려 `UNKNOWN_OWNER` 가 되거나, 더 나쁘게는 부르지 않은 시민을 가리킨다.
 */
function couponsUrl(ownerId: string): string {
  return `${COUPONS_PATH}?${new URLSearchParams({ [OWNER_ID_QUERY]: ownerId })}`;
}

function unexpectedResponse(status: number): MyCouponsState {
  return {
    status: 'failed',
    error: {
      code: UNEXPECTED_RESPONSE,
      /* 상태 번호를 버리지 않는다. 코드가 계약 밖이라 이 번호가 유일하게 남는 단서다. */
      message: `서버 응답을 쿠폰 목록 계약으로 읽지 못했습니다. HTTP 상태 ${status}.`,
    },
  };
}

/**
 * `ListCouponsResponse` 로 읽히면 그 목록을, 아니면 `undefined` 를 준다.
 *
 * 성공 본문을 `as` 로 믿지 않고 여기서 모양을 확인한다 — 시민 목록 훅(`CP-06-03`)이 정한
 * 것이고, 훅이 반환 타입으로 `IssuedCoupon[]` 이라고 선언하는 값이니 그 선언이 참이 되는 지점도
 * 이 검사뿐이다.
 *
 * 어긋난 원소를 골라내지 않고 목록 전체를 계약 밖으로 본다. 골라내면 화면이 쿠폰 일부만
 * 조용히 보여주고, 빠진 쿠폰이 있다는 사실이 아무 데도 남지 않는다.
 *
 * 순서를 그대로 둔다 — `issuedAt` 내림차순은 서버가 지는 계약이다 (설계문서 8장). 화면이
 * 다시 정렬하면 서버 정렬이 깨졌을 때 그 사실을 화면이 가려 버린다.
 */
function couponListOf(body: unknown): IssuedCoupon[] | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { coupons } = body as Partial<ListCouponsResponse>;
  if (!Array.isArray(coupons)) return undefined;
  return coupons.every(isCoupon) ? coupons : undefined;
}

/**
 * 상태 값의 표. 쿠폰 카드(`CP-06-02`)의 문구 표와 같은 틀이라, 라이프사이클 에픽이
 * `IssuedCouponStatus` 를 늘리면 이 표가 컴파일 오류로 새 값을 요구한다.
 */
const KNOWN_STATUSES: Record<IssuedCouponStatus, true> = {
  held: true,
};

/**
 * 쿠폰 원소의 검사 범위는 **쿠폰 카드(`CP-06-02`)가 실제로 읽는 필드**다 — `status`,
 * `merchantName`, `faceValue`, `benefitSplit` 의 두 비율, `heldUntil`, `expiresAt`.
 * `coupon-card.tsx` 의 구조 분해에 든 이름이 정확히 이 일곱이다.
 *
 * `IssuedCoupon` 은 필드가 열둘이지만 나머지 다섯(`id`·`trigger`·`ownerId`·`ownerName`·
 * `merchantId`·`issuedAt`)은 카드가 읽지 않아 검사하지 않는다. 아는 필드만 보고 모르는
 * 필드는 통과시키는 것이 시민 목록 훅이 정한 방식이고, 그래야 계약에 필드가 늘어도 이
 * 검사가 막지 않는다.
 *
 * 카드가 읽는 필드로 범위를 잡는 근거는 이 값이 곧장 카드로 가기 때문이다. `benefitSplit`
 * 이 없으면 카드가 그 자리에서 죽고, 죽지 않는 어긋남은 더 나쁘다 — 숫자가 아닌 비율은
 * `NaN%` 로, 시각이 아닌 기한은 `NaN-NaN-NaN` 으로 그려진다. 그 세 줄이 이 브랜치가 지는
 * 거래조건 고지이므로(설계문서 10장), 고지 자리에 뜻 없는 문자열을 그리느니 목록 전체를
 * 계약 밖으로 보고 실패로 알리는 편이 맞다.
 */
function isCoupon(value: unknown): value is IssuedCoupon {
  if (typeof value !== 'object' || value === null) return false;
  const { status, merchantName, faceValue, benefitSplit, heldUntil, expiresAt } =
    value as Partial<IssuedCoupon>;

  return (
    typeof status === 'string' &&
    Object.hasOwn(KNOWN_STATUSES, status) &&
    typeof merchantName === 'string' &&
    typeof faceValue === 'number' &&
    isBenefitSplit(benefitSplit) &&
    typeof heldUntil === 'string' &&
    typeof expiresAt === 'string'
  );
}

/** 중첩된 배분 비율. 카드가 두 비율을 각각 퍼센트로 옮기므로 둘 다 숫자여야 한다. */
function isBenefitSplit(value: unknown): value is BenefitSplit {
  if (typeof value !== 'object' || value === null) return false;
  const { ownerRatio, consumerRatio } = value as Partial<BenefitSplit>;
  return typeof ownerRatio === 'number' && typeof consumerRatio === 'number';
}

/** `ApiErrorResponse` 로 읽히면 그 오류를, 아니면 `undefined` 를 준다. */
function contractErrorOf(body: unknown): MyCouponsFailure | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { error } = body as Partial<ApiErrorResponse>;
  if (typeof error !== 'object' || error === null) return undefined;
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return undefined;
  return { code: error.code, message: error.message };
}
