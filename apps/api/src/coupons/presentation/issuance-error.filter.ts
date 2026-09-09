import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { BadRequestException, Catch, HttpStatus, Logger } from '@nestjs/common';
import type { ApiErrorCode, ApiErrorResponse } from '@im-coupon/contracts';

import { IssuanceError } from '../../issuance/domain/services/engine';

/**
 * 8장이 오류 코드마다 정한 HTTP 상태.
 *
 * `Record<ApiErrorCode, HttpStatus>` 로 두어 계약에 코드가 늘면 상태를 빠뜨린 채로는
 * 컴파일되지 않게 한다. 그래서 이 표는 발급 엔드포인트가 실제로 던지는 넷보다 넓고,
 * 조회 엔드포인트의 코드 둘도 8장이 이미 정한 값으로 채워져 있다 — 값을 여기서 새로
 * 정한 것이 아니라, 총합을 강제한 대가로 미리 적히는 자리다.
 */
const STATUS: Record<ApiErrorCode, HttpStatus> = {
  INVALID_BODY: HttpStatus.BAD_REQUEST,
  INVALID_WEIGHTS: HttpStatus.BAD_REQUEST,
  NO_CANDIDATES: HttpStatus.UNPROCESSABLE_ENTITY,
  MISSING_OWNER_ID: HttpStatus.BAD_REQUEST,
  UNKNOWN_OWNER: HttpStatus.NOT_FOUND,
  STORAGE_FAILURE: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * `STORAGE_FAILURE` 가 응답에 싣는 문구.
 *
 * 이 코드만 원 메시지를 가린다. Node 의 fs 오류는 실패한 파일의 절대 경로를 메시지에
 * 싣고, 그 경로에는 서버를 돌리는 계정 이름이 들어간다 — 오류 응답은 그대로 시연 화면의
 * 오류 영역에 뜨므로 그 자리가 서버 파일시스템을 내보이는 창이 된다. 나머지 코드는
 * 메시지가 요청 내용에서 나오므로 가리지 않는다.
 *
 * 원인을 잃지 않도록 감싸는 쪽(적재·저장)은 지금처럼 원 오류의 말을 메시지에 남기고,
 * 무엇을 내보일지는 이 경계 한 곳에서만 정한다.
 */
export const STORAGE_FAILURE_MESSAGE = '저장소를 읽거나 쓰지 못해 발급하지 못했다';

/** 오류 응답 본문을 쓰기 위해 필요한 만큼만 뽑은 응답 객체. */
interface ErrorResponder {
  status(code: number): { json(body: ApiErrorResponse): void };
}

/**
 * 본문 파싱 실패를 옮겨 담을 오류. 파서가 던진 원 오류는 여기까지 오지 않으므로
 * (아래 참조) 코드와 말은 이 자리가 짓는다.
 */
const PARSE_FAILURE = new IssuanceError('INVALID_BODY', '요청 본문을 JSON 으로 파싱하지 못했다');

/**
 * 발급의 실패를 8장의 오류 응답으로 옮기는 자리.
 *
 * 발급이 올리는 실패는 `IssuanceError` 하나다 — 엔진의 거부와, 적재·저장이 감싼 파일 IO
 * 실패, 컨트롤러의 본문 모양 거부가 전부 이 예외로 온다 (4장 결정 11). 그래서 상태와 본문을
 * 정하는 자리도 한 곳이면 되고, 그 한 곳이 여기다.
 *
 * `BadRequestException` 을 함께 잡는 것은 본문 파싱 실패가 그 예외로만 도착하기 때문이다.
 * 파싱은 라우트에 닿기 전 미들웨어에서 일어나고, 플랫폼 어댑터가 파서의 `SyntaxError` 를
 * `BadRequestException` 으로 바꾸면서 원 오류를 버린다 — 잡을 수 있는 것이 이 타입뿐이다.
 * 그러지 않으면 이 경로만 `{statusCode, error, message}` 라는 다른 모양으로 나가, 화면의
 * 오류 영역이 `error.code` 를 읽지 못한다. 이 앱은 `BadRequestException` 을 스스로 던지지
 * 않으므로 지금 여기 오는 것은 어댑터가 만든 잘못된 요청 입력뿐이고, 앞으로도 그래야 한다 —
 * 400 이 필요한 자리는 `IssuanceError` 로 코드까지 함께 정해서 던진다.
 */
@Catch(IssuanceError, BadRequestException)
export class IssuanceErrorFilter implements ExceptionFilter<IssuanceError | BadRequestException> {
  private readonly logger = new Logger(IssuanceErrorFilter.name);

  catch(exception: IssuanceError | BadRequestException, host: ArgumentsHost): void {
    const error = exception instanceof IssuanceError ? exception : PARSE_FAILURE;
    const message = this.messageFor(error);
    const response = host.switchToHttp().getResponse<ErrorResponder>();
    response.status(STATUS[error.code]).json({ error: { code: error.code, message } });
  }

  /**
   * 내보낼 말을 정한다. 가리는 코드는 원 메시지를 로그로 돌려, 응답에서 걷어낸 원인이
   * 어디에도 남지 않는 상태 — 500 만 보이고 무엇이 실패했는지 아무도 모르는 상태 — 를 막는다.
   */
  private messageFor(exception: IssuanceError): string {
    if (exception.code !== 'STORAGE_FAILURE') return exception.message;
    this.logger.error(exception.message);
    return STORAGE_FAILURE_MESSAGE;
  }
}
