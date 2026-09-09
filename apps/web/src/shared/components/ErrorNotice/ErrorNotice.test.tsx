import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApiErrorCode } from '@im-coupon/contracts';

import { ErrorNotice } from './ErrorNotice';

/**
 * 계약이 든 오류 코드 여섯 전부에 안내 한 줄이 붙는지 본다. 이 표를
 * `Record<ApiErrorCode, string>` 으로 선언해, 계약에 코드가 늘면 테스트도 함께
 * 컴파일 오류로 그 사실을 안다 (설계문서 8장).
 */
const EXPECTED_HINT_KEYWORDS: Record<ApiErrorCode, string> = {
  INVALID_BODY: '요청 본문',
  INVALID_WEIGHTS: '가중치',
  NO_CANDIDATES: '발급 후보',
  MISSING_OWNER_ID: '소유자',
  UNKNOWN_OWNER: '시민 목록',
  STORAGE_FAILURE: '저장소',
};

/**
 * `STORAGE_FAILURE` 의 메시지는 서버가 일부러 가린 고정 문구다 — 원 fs 오류에는 서버의
 * 절대 경로와 그 계정 이름이 들어간다. 화면은 이 문구를 그대로 보여주기만 한다.
 * `apps/web` 은 `apps/api` 를 import 하지 않으므로(저장소 구조 문서의 의존 방향)
 * 서버가 보내는 값을 여기 문자열로 둔다.
 */
const MASKED_STORAGE_MESSAGE = '저장소를 읽거나 쓰지 못해 발급하지 못했다';

function renderNotice(code: string, message: string) {
  render(<ErrorNotice code={code} message={message} />);
  return screen.getByRole('alert', { name: '오류' });
}

describe('ErrorNotice', () => {
  it('오류 영역을 스크린 리더에 알리는 자리로 둔다', () => {
    expect(renderNotice('NO_CANDIDATES', '발급 후보가 없다')).toBeInTheDocument();
  });

  it('서버가 준 코드와 메시지를 그대로 보여준다', () => {
    const notice = renderNotice('NO_CANDIDATES', '발급 후보가 없다');

    expect(screen.getByTestId('error-code').textContent).toBe('NO_CANDIDATES');
    expect(screen.getByTestId('error-message').textContent).toBe('발급 후보가 없다');
    expect(notice).toHaveTextContent('NO_CANDIDATES: 발급 후보가 없다');
  });

  it('계약의 오류 코드 여섯 전부에 안내 한 줄이 붙는다', () => {
    for (const [code, keyword] of Object.entries(EXPECTED_HINT_KEYWORDS)) {
      const { unmount } = render(<ErrorNotice code={code} message="서버 메시지" />);

      expect(screen.getByTestId('error-hint').textContent).toContain(keyword);
      unmount();
    }
  });

  it('계약 밖의 코드가 와도 코드와 메시지는 그대로 보이고 안내 줄만 빠진다', () => {
    // 프록시나 이후 계약이 내는 코드, 그리고 훅이 실어 올릴 네트워크 실패가 이 자리로 온다.
    const notice = renderNotice('GATEWAY_TIMEOUT', '응답을 받지 못했다');

    expect(screen.getByTestId('error-code').textContent).toBe('GATEWAY_TIMEOUT');
    expect(screen.getByTestId('error-message').textContent).toBe('응답을 받지 못했다');
    expect(notice).toHaveTextContent('GATEWAY_TIMEOUT: 응답을 받지 못했다');
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('가려진 STORAGE_FAILURE 문구를 화면이 고쳐 쓰지 않는다', () => {
    renderNotice('STORAGE_FAILURE', MASKED_STORAGE_MESSAGE);

    expect(screen.getByTestId('error-message').textContent).toBe(MASKED_STORAGE_MESSAGE);
  });

  it('가려진 원인을 화면이 추측해 덧붙이지 않는다', () => {
    const notice = renderNotice('STORAGE_FAILURE', MASKED_STORAGE_MESSAGE);

    // 원 fs 오류가 싣던 것들 — 서버 경로·권한·파일명 추측이 이 자리에 되살아나면 안 된다.
    expect(notice.textContent).not.toMatch(/\/(Users|home|var|tmp)\/|ENOENT|EACCES|권한|디스크|\.json/);
  });
});
