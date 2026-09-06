import type { ApiErrorCode } from '@im-coupon/contracts';

/**
 * 오류 코드별 한 줄 안내. 8장 오류 응답의 조건을 사람 문장으로 옮긴 것이고,
 * 키 집합을 `ApiErrorCode` 에서 끌어와 계약에 코드가 늘면 이 화면이 컴파일 오류로
 * 그 사실을 알린다 (`SIGNAL_LABELS` 가 신호에 대해 잡은 방식과 같다).
 *
 * 발급 엔드포인트가 내는 것은 앞의 셋과 `STORAGE_FAILURE` 넷이지만, 이 컴포넌트는
 * 조회 화면(`CP-06-05`)도 쓸 자리라 계약의 여섯을 다 든다.
 */
const ERROR_HINTS: Record<ApiErrorCode, string> = {
  INVALID_BODY: '요청 본문이 JSON 으로 읽히지 않거나 가중치가 객체가 아닙니다.',
  INVALID_WEIGHTS:
    '가중치 값이 숫자가 아니거나 음수이거나 합이 0 이거나, 모르는 신호 키가 들어 있습니다.',
  NO_CANDIDATES: '가맹점 또는 시민이 비어 있어 발급 후보를 만들 수 없습니다.',
  MISSING_OWNER_ID: '조회할 소유자를 하나로 정할 수 없습니다.',
  UNKNOWN_OWNER: '시민 목록에 없는 소유자입니다.',
  STORAGE_FAILURE: '저장소의 JSON 파일을 읽거나 쓰지 못했습니다.',
};

export interface ErrorNoticeProps {
  /**
   * 오류 코드. `ApiErrorCode` 로 좁히지 않는다. 서버가 계약 밖 코드를 내는 상황
   * (프록시·이후 계약)에서 이 자리가 빈칸이 되면 안 되고, 요청이 응답에 닿지 못한
   * 네트워크 실패도 같은 자리에 실리는데 그것은 `ApiErrorResponse` 가 아니다.
   */
  code: string;
  /** 서버가 준 메시지. 화면이 다시 쓰지 않는다 */
  message: string;
}

/**
 * 와이어프레임의 오류 영역이다 (설계문서 11장). 코드와 메시지를 그대로 보여주고,
 * 아는 코드면 안내 한 줄을 덧붙인다. props 만 받아 그리는 UI 전용 컴포넌트다 —
 * fetch·상태 로직을 갖지 않는다 (4장 결정 10).
 */
export function ErrorNotice({ code, message }: ErrorNoticeProps) {
  /* 조회는 문자열 키로 한다 — 표에 없는 코드가 와도 코드·메시지는 보이고 안내 줄만 빠진다. */
  const hint: string | undefined = (ERROR_HINTS as Record<string, string>)[code];

  return (
    <section role="alert" aria-label="오류">
      <h2>오류</h2>
      <p>
        {/*
          메시지는 서버가 준 문구 그대로다. 특히 `STORAGE_FAILURE` 의 문구는 서버가
          일부러 가린 고정 문구이므로(원 fs 오류에 서버 절대경로와 계정 이름이 든다)
          화면이 그것을 풀어 쓰거나 원인을 추측해 덧붙이지 않는다.
        */}
        <strong data-testid="error-code">{code}</strong>:{' '}
        <span data-testid="error-message">{message}</span>
      </p>
      {hint !== undefined && <p data-testid="error-hint">{hint}</p>}
    </section>
  );
}
