import { useEffect, useState } from 'react';
import {
  CITIZENS_PATH,
  type ApiErrorResponse,
  type Citizen,
  type ListCitizensResponse,
} from '@im-coupon/contracts';

/**
 * 오류 영역에 실을 실패 하나. `code` 를 `ApiErrorCode` 로 좁히지 않는다 — 계약 밖 응답과
 * 네트워크 실패도 같은 자리에 실려야 하고, `ErrorNotice` 의 `code` 가 그래서 `string` 이다.
 *
 * 발급 훅(`CP-05-06`)의 실패 타입과 필드가 같지만 그것을 가져다 쓰지 않는다. 이름이 발급의
 * 실패를 가리키고, 형제 훅끼리 타입을 빌리면 둘 중 한쪽이 자기 실패 모양을 바꿀 때 다른
 * 쪽이 함께 끌려간다. 두 훅이 실제로 맞물리는 자리는 `ErrorNotice` 의 props 뿐이고,
 * 그 짝은 이름이 아니라 필드 모양으로 맞는다.
 */
export interface CitizensFailure {
  code: string;
  message: string;
}

/**
 * 시민 목록 조회의 상태. 판별 유니온이라 모순 조합(조회 중인데 결과가 있음, 성공과 실패가
 * 함께 남음)이 아예 표현되지 않는다 — 발급 호출(`CP-05-06`)이 같은 이유로 고른 모양이다.
 */
export type CitizensState =
  | { status: 'loading' }
  | { status: 'loaded'; citizens: Citizen[] }
  | { status: 'failed'; error: CitizensFailure };

export interface UseCitizens {
  state: CitizensState;
}

/** 계약 밖 응답. 계약의 여섯 코드와 겹치지 않게 두어 오류 영역의 안내가 거짓말하지 않는다. */
const UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE';
/** 요청이 응답에 닿지 못한 실패. 서버가 내지 않은 코드이므로 계약의 여섯을 빌려 쓰지 않는다. */
const NETWORK_FAILURE = 'NETWORK_FAILURE';

/**
 * 내 쿠폰 화면의 소유자 선택을 채울 시민 목록 조회 (`CP-06-03`, 설계문서 4장 결정 10 —
 * 로직은 훅이 진다). 마운트 때 한 번 조회하고 상태만 돌려준다 — 무엇을 그릴지는 화면
 * 조립(`CP-06-05`)이 정한다.
 *
 * 다시 조회하는 함수를 두지 않는다. 시민 목록에는 재실행 트리거가 없어 화면에 그것을
 * 부를 자리가 없다.
 */
export function useCitizens(): UseCitizens {
  const [state, setState] = useState<CitizensState>({ status: 'loading' });

  useEffect(() => {
    /* 언마운트 뒤에 도착한 응답이 사라진 컴포넌트의 상태를 건드리지 않게 막는다. */
    let cancelled = false;
    requestCitizens().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state };
}

async function requestCitizens(): Promise<CitizensState> {
  let response: Response;
  try {
    response = await fetch(CITIZENS_PATH);
  } catch {
    return {
      status: 'failed',
      error: {
        code: NETWORK_FAILURE,
        message: '시민 목록 요청이 서버에 닿지 못했습니다. 네트워크와 서버 상태를 확인하세요.',
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
    const citizens = citizenListOf(body);
    return citizens === undefined
      ? unexpectedResponse(response.status)
      : { status: 'loaded', citizens };
  }
  const error = contractErrorOf(body);
  /* 서버 메시지를 화면이 다시 쓰지 않는다 — `STORAGE_FAILURE` 문구는 서버가 일부러 가린 것이다. */
  return error === undefined ? unexpectedResponse(response.status) : { status: 'failed', error };
}

function unexpectedResponse(status: number): CitizensState {
  return {
    status: 'failed',
    error: {
      code: UNEXPECTED_RESPONSE,
      /* 상태 번호를 버리지 않는다. 코드가 계약 밖이라 이 번호가 유일하게 남는 단서다. */
      message: `서버 응답을 시민 목록 계약으로 읽지 못했습니다. HTTP 상태 ${status}.`,
    },
  };
}

/**
 * `ListCitizensResponse` 로 읽히면 그 목록을, 아니면 `undefined` 를 준다.
 *
 * 성공 본문을 `as` 로 믿지 않고 여기서 모양을 확인한다. 이 값은 소유자 선택(`CP-06-01`)의
 * `citizens.map` 과 그 안의 `citizen.id`·`citizen.name` 으로 곧장 가므로, 배열이 아니거나
 * 원소가 그 두 필드를 갖지 않으면 화면이 그 자리에서 죽는다. 훅이 반환 타입으로 `Citizen[]`
 * 이라고 선언하는 값이기도 하니, 그 선언이 참이 되는 지점은 이 검사 하나뿐이다.
 *
 * 어긋난 원소를 골라내지 않고 목록 전체를 계약 밖으로 본다. 골라내면 화면이 시민 일부만
 * 조용히 보여주고, 고를 수 없게 된 시민이 있다는 사실이 아무 데도 남지 않는다.
 *
 * 아는 필드만 보고 모르는 필드는 통과시키므로, 계약에 필드가 늘어도 이 검사가 막지 않는다.
 */
function citizenListOf(body: unknown): Citizen[] | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { citizens } = body as Partial<ListCitizensResponse>;
  if (!Array.isArray(citizens)) return undefined;
  /* 순서를 그대로 둔다 — 시드에 든 순서 그대로가 계약이다 (설계문서 8장 시민 목록). */
  return citizens.every(isCitizen) ? citizens : undefined;
}

function isCitizen(value: unknown): value is Citizen {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name } = value as Partial<Citizen>;
  return typeof id === 'string' && typeof name === 'string';
}

/** `ApiErrorResponse` 로 읽히면 그 오류를, 아니면 `undefined` 를 준다. */
function contractErrorOf(body: unknown): CitizensFailure | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { error } = body as Partial<ApiErrorResponse>;
  if (typeof error !== 'object' || error === null) return undefined;
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return undefined;
  return { code: error.code, message: error.message };
}
