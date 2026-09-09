import { useCallback, useRef, useState } from 'react';
import {
  ISSUE_COUPON_PATH,
  type ApiErrorResponse,
  type IssuanceRequest,
  type IssueCouponResponse,
  type SignalWeights,
} from '@im-coupon/contracts';

import type { WeightsDraft } from '../components/WeightsEditor/WeightsEditor';

/**
 * 오류 영역에 실을 실패 하나. `code` 를 `ApiErrorCode` 로 좁히지 않는다 — 계약 밖 응답과
 * 네트워크 실패도 같은 자리에 실려야 하고, `ErrorNotice` 의 `code` 가 그래서 `string` 이다.
 */
export interface IssueFailure {
  code: string;
  message: string;
}

/**
 * 발급 호출의 상태. 판별 유니온이라 모순 조합(발급 중인데 결과가 있음, 성공과 실패가 함께
 * 남음)이 아예 표현되지 않는다 — 저장소 상태(`CP-05-02`)가 같은 이유로 고른 모양이다.
 */
export type IssueCouponState =
  | { status: 'idle' }
  | { status: 'issuing' }
  | { status: 'succeeded'; result: IssueCouponResponse }
  | { status: 'failed'; error: IssueFailure };

export interface UseIssueCoupon {
  state: IssueCouponState;
  /** 발급을 한 번 실행한다. 발급 중이면 아무 일도 하지 않는다. */
  issue: (draft: WeightsDraft) => Promise<void>;
}

/** 계약 밖 응답. 계약의 여섯 코드와 겹치지 않게 두어 오류 영역의 안내가 거짓말하지 않는다. */
const UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE';
/** 요청이 응답에 닿지 못한 실패. 서버가 내지 않은 코드이므로 계약의 여섯을 빌려 쓰지 않는다. */
const NETWORK_FAILURE = 'NETWORK_FAILURE';

/**
 * 발급 실행 화면의 fetch·상태 로직 (`CP-05-06`, 설계문서 4장 결정 10). UI 를 모르고
 * 상태와 실행 함수만 돌려준다 — 무엇을 그릴지는 화면 조립(`CP-05-07`)이 정한다.
 */
export function useIssueCoupon(): UseIssueCoupon {
  const [state, setState] = useState<IssueCouponState>({ status: 'idle' });
  /*
    발급 중 재호출을 훅 스스로 막는다. 상태로 판정하면 같은 렌더의 두 번째 호출이 아직
    갱신되지 않은 값을 보므로, 렌더를 기다리지 않는 ref 로 든다. 서버는 두 요청을 직렬화해
    둘 다 저장하므로, 버튼 한 번에 쿠폰 1건이라는 이 화면의 뜻은 여기서 지켜야 한다.
  */
  const issuing = useRef(false);

  const issue = useCallback(async (draft: WeightsDraft): Promise<void> => {
    if (issuing.current) return;
    issuing.current = true;
    /* 시작하면서 직전 결과를 걷는다 — 성공 뒤에 실패가, 실패 뒤에 성공이 남지 않는다. */
    setState({ status: 'issuing' });

    try {
      setState(await requestIssue(draft));
    } finally {
      issuing.current = false;
    }
  }, []);

  return { state, issue };
}

async function requestIssue(draft: WeightsDraft): Promise<IssueCouponState> {
  let response: Response;
  try {
    response = await fetch(ISSUE_COUPON_PATH, {
      method: 'POST',
      /*
        본문을 싣는 호출자는 형식을 JSON 으로 선언한다 (설계문서 8장). 선언하지 않으면
        서버 파서가 본문을 건너뛰어, 가중치가 소리 없이 버려진 채 기본값으로 발급된
        `201` 이 돌아온다 — 호출자는 자기가 지정한 값이 사라진 것을 모른다.
      */
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toRequest(draft)),
    });
  } catch {
    return {
      status: 'failed',
      error: {
        code: NETWORK_FAILURE,
        message: '발급 요청이 서버에 닿지 못했습니다. 네트워크와 서버 상태를 확인하세요.',
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
    return { status: 'succeeded', result: body as IssueCouponResponse };
  }
  const error = contractErrorOf(body);
  /* 서버 메시지를 화면이 다시 쓰지 않는다 — `STORAGE_FAILURE` 문구는 서버가 일부러 가린 것이다. */
  return error === undefined
    ? unexpectedResponse(response.status)
    : { status: 'failed', error };
}

function unexpectedResponse(status: number): IssueCouponState {
  return {
    status: 'failed',
    error: {
      code: UNEXPECTED_RESPONSE,
      /* 상태 번호를 버리지 않는다. 코드가 계약 밖이라 이 번호가 유일하게 남는 단서다. */
      message: `서버 응답을 발급 계약으로 읽지 못했습니다. HTTP 상태 ${status}.`,
    },
  };
}

/** `ApiErrorResponse` 로 읽히면 그 오류를, 아니면 `undefined` 를 준다. */
function contractErrorOf(body: unknown): IssueFailure | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { error } = body as Partial<ApiErrorResponse>;
  if (typeof error !== 'object' || error === null) return undefined;
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return undefined;
  return { code: error.code, message: error.message };
}

/**
 * 입력 원문을 요청 본문으로 옮긴다 (설계문서 8장).
 *
 * - 빈 문자열은 "지정하지 않음"이라 키를 뺀다. 서버가 `params.ts` 기본값으로 채운다(병합 2단계).
 *   `0` 으로 보내면 합이 0 이 되어 `INVALID_WEIGHTS` 인데, 빈 칸의 뜻은 "기본값으로"다.
 * - 그 밖은 `Number` 로 바꿔 그대로 보낸다. 음수·`NaN`·`±Infinity` 는 8장이 이미
 *   `INVALID_WEIGHTS` 로 거부하도록 정한 것들이고, 그 거부를 보여주는 것이 이 화면의 일이다.
 *   `JSON.stringify` 가 `NaN`·`Infinity` 를 `null` 로 싣는데, 8장이 `null` 을 걷어내지 않고
 *   "숫자가 아님"으로 거부하므로 경로가 그대로 맞는다.
 * - 공백만 든 값을 트림하지 않는다. `Number(' ')` 는 `0` 이므로 서버가 값 규칙으로 판정한다.
 *   트림하면 그 입력이 빈 칸과 같아져 기본값으로 발급되어 버린다.
 *
 * 키가 전부 빠져도 `weights` 를 생략하지 않고 `{}` 로 보낸다. 8장이 둘을 같게 다루므로
 * 어느 쪽이든 맞고, 한 모양으로 굳혀 두면 본문을 만드는 경로가 하나로 남는다.
 */
function toRequest(draft: WeightsDraft): IssuanceRequest {
  const weights: Partial<Record<keyof SignalWeights, number>> = {};

  for (const key of Object.keys(draft) as (keyof SignalWeights)[]) {
    const text = draft[key];
    if (text === '') continue;
    weights[key] = Number(text);
  }

  return { weights };
}
