import type { SignalContext } from '../signal';

/**
 * 개인화 신호의 메모리 입력 계약.
 *
 * 새 테이블도 새 JSON 컬렉션도 만들지 않는다. 사용 이력과 가게 벡터는 전부 호출자가
 * 메모리로 넘기고, 이 신호는 그것을 읽기만 한다 — 사용 사건을 기존 소비 레코드에서
 * 만들려면 그 소비를 실제로 누가 했는지 귀속하는 규칙이 먼저 있어야 하는데, 소비에 남는
 * 이름으로 실제 사용자를 추정하지 않기로 한 이상 그 규칙이 아직 없다. 벡터를 낼 모델
 * 산출물의 모양도 정해지지 않았다. 그래서 이 신호는 주어진 입력으로 동작을 완성하는
 * 범위에 머문다.
 *
 * 점수 준비(`preparePersonalFit`)와 조회(`personalFitSignal`)가 같은 계약을 보도록
 * 타입을 한 파일에 모은다.
 */

/**
 * 점수를 낸 규칙의 판본. 준비 결과마다 굳혀, 결과만 들고 있는 쪽도 어떤 규칙으로 나온
 * 점수인지 알 수 있게 한다 — 정제 규칙이나 산식이 바뀌면 같은 입력에서 다른 점수가
 * 나오므로, 판본을 적지 않으면 두 판본의 결과를 구분할 근거가 결과 안에 남지 않는다.
 */
export const PERSONAL_FIT_SIGNAL_VERSION = 'personalFit.behavior.v1';

/**
 * 날짜별 중복 제거의 기준 시간대. 이번 판본은 `Asia/Seoul` 하나만 받는다 — 시간대가
 * 바뀌면 "같은 날" 의 경계가 움직여 점수가 통째로 달라지므로, 다른 값을 받을 수 있게
 * 열어 두는 것 자체가 검증되지 않은 결과를 부른다. 서버 로컬 시간대는 쓰지 않는다.
 */
export type PersonalFitDayZone = 'Asia/Seoul';

/**
 * 사용 사건의 확정 여부. 취소된 사건은 이력에서 빼되 입력에서 지우지는 않는다 —
 * 같은 거래의 이전 revision 을 되살리지 않으려면 취소되었다는 사실 자체가 필요하다.
 */
export type PersonalFitUsageStatus = 'confirmed' | 'cancelled';

/**
 * 사용 사건 하나. 같은 거래가 정정되면 `revision` 이 오른 사건이 새로 들어오며,
 * 이전 사건도 함께 남는다 — 정정 전후를 모두 봐야 어느 것이 최신인지 고를 수 있다.
 *
 * 시각은 전부 UTC epoch 밀리초다. 문자열 시각의 해석은 입력을 만드는 쪽의 몫으로 두어,
 * 이 신호가 시간대·형식 해석 책임을 지지 않게 한다.
 */
export interface PersonalFitUsageEvent {
  readonly transactionId: string;
  /** 같은 거래의 정정 차수. 0 이상의 안전한 정수 */
  readonly revision: number;
  /** 정정까지 반영한 실제 사용자. 불명이면 `null` 이며 이력에서 제외된다 */
  readonly actualUserId: string | null;
  readonly merchantId: string;
  /** 사용 시각. 관측 구간 판정과 최근성 가중의 기준이다 */
  readonly usedAt: number;
  /** 기록 시각. 기준 시각보다 미래인 기록은 최신 revision 선별에 넣지 않는다 */
  readonly recordedAt: number;
  readonly status: PersonalFitUsageStatus;
  /** 취소분을 뺀 사용액. 양수인 사건만 쓰며 금액 크기로 더 가중하지는 않는다 */
  readonly netAmount: number;
  /** 사건 당시의 가게 내용 버전. 그때의 벡터를 찾는 열쇠다 */
  readonly contentVersion: string;
}

/**
 * 가게 하나의 내용 버전 하나에 대한 벡터.
 *
 * 가게 ID 만으로는 모자라고 내용 버전까지 함께 맞춘다. 과거 사건에는 그때의 내용으로
 * 만든 벡터를 써야 하며, 지금 내용으로 과거를 덮으면 그 시점에 없던 정보가 점수에
 * 섞인다.
 */
export interface PersonalFitMerchantVector {
  readonly merchantId: string;
  readonly contentVersion: string;
  /**
   * 모델과 전처리의 조합을 가리키는 식별자. 명세가 다른 벡터끼리는 내적이 의미를 갖지
   * 않으므로, 한 준비 요청에 쓰이는 벡터는 전부 같은 값이어야 한다.
   */
  readonly specId: string;
  /** 이 벡터가 알려진 시각 */
  readonly knownAt: number;
  /**
   * 이 벡터가 검증된 시각. `knownAt` 과 따로 보존한다 — 알려졌지만 아직 검증되지 않은
   * 구간이 있고, 그 구간의 벡터를 과거 시점 계산에 쓰면 미래 정보가 새어 든다.
   */
  readonly verifiedAt: number;
  readonly values: readonly number[];
}

/**
 * 점수를 매길 후보 가게의 지목. 한 준비 요청 안에서 가게 ID 는 유일하다 — 같은 가게의
 * 서로 다른 내용 버전을 함께 후보로 넣으면 가게 ID 로 조회하는 점수 맵에서 둘을
 * 가릴 수 없다.
 */
export interface PersonalFitCandidateRef {
  readonly merchantId: string;
  readonly contentVersion: string;
}

/** 점수 계산의 파라미터. 기본값은 `DEFAULT_PERSONAL_FIT_PARAMS` 에 있다. */
export interface PersonalFitParams {
  /** 이력을 보는 구간의 길이(일). 양의 유한 값 */
  readonly lookbackDays: number;
  /** 최근성 가중이 절반으로 줄어드는 간격(일). 양의 유한 값 */
  readonly halfLifeDays: number;
  /** 한 가게가 프로필에 실을 수 있는 가중치의 상한. 양의 유한 값 */
  readonly merchantWeightCap: number;
  readonly dayZone: PersonalFitDayZone;
  /** 이 값 이하의 노름은 방향을 말할 수 없는 것으로 본다. 양의 유한 값 */
  readonly normEpsilon: number;
}

/**
 * 파라미터 기본값. 이 수치를 코드에서 드는 유일한 자리이므로, 값을 알아야 하는 쪽은
 * 수를 다시 적지 말고 여기서 끌어다 쓴다.
 *
 * 타입의 `readonly` 는 컴파일에서만 막으므로 런타임까지 함께 얼린다 — 이 상수는 모든
 * 준비 호출이 같은 객체를 보는 자리라, 한 번 바뀌면 그 뒤의 모든 계산이 조용히 달라진다.
 */
export const DEFAULT_PERSONAL_FIT_PARAMS: PersonalFitParams = Object.freeze({
  lookbackDays: 90,
  halfLifeDays: 30,
  merchantWeightCap: 2,
  dayZone: 'Asia/Seoul',
  normEpsilon: 1e-12,
});

/**
 * 준비 요청. 시민 한 명과 후보 집합 하나를 고정해 한 번 준비하고, 조회는 그 결과를
 * 재사용한다.
 *
 * 사건 목록은 이 시민의 것만 걸러 넣을 필요가 없다 — 사용자 정정을 보려면 정정 전
 * 사용자의 사건까지 봐야 하므로, 사용자 필터는 이 계약이 아니라 정제 단계의 몫이다.
 */
export interface PreparePersonalFitInput {
  readonly citizenId: string;
  readonly candidates: readonly PersonalFitCandidateRef[];
  /** 기준 시각(UTC epoch 밀리초). 관측 구간과 "지금 알려진 것" 의 경계를 함께 정한다 */
  readonly asOf: number;
  readonly events: readonly PersonalFitUsageEvent[];
  readonly vectors: readonly PersonalFitMerchantVector[];
  /**
   * 생략한 키만 기본값으로 채운다. 생략과 "잘못된 값을 명시적으로 준 것" 은 타입으로
   * 갈리지 않으므로, 잘못된 값을 기본값으로 덮지 않고 거부하는 것은 준비 함수가 진다.
   */
  readonly params?: Partial<PersonalFitParams>;
}

/**
 * 가게 ID 로 찾는 점수. 변경 메서드가 없는 형태라, 준비 결과를 받은 쪽은 타입만으로는
 * 점수를 고쳐 쓸 수 없다.
 *
 * `Map` 이 아니라 평범한 객체를 쓰는 이유는 그 위에 런타임 동결을 얹을 수 있어서다 —
 * `Object.freeze(new Map())` 은 `set()` 을 막지 못해 맵을 얼리는 것이 헛돈다.
 *
 * 그 대신 객체는 만드는 쪽과 읽는 쪽 양쪽에 조건이 붙는다. 읽는 쪽은 키 조회가
 * 프로토타입까지 타므로(`scores['constructor']` 가 함수로 잡힌다) 소유 키인지 먼저
 * 확인해야 한다. 만드는 쪽은 `Object.create(null)` 에서 시작해 소유 데이터 프로퍼티로만
 * 채운 뒤 동결해야 한다 — 일반 객체에 `scores['__proto__'] = 0.4` 는 소유 키를 만들지
 * 못하고 점수를 조용히 버려서, 읽는 쪽이 소유 키 검사를 제대로 해도 그 후보를 후보 집합
 * 밖으로 오판한다. 두 조건 중 하나만 지키면 안전하지 않다.
 *
 * 키가 있는지를 값의 참·거짓으로 가르지 않는 것은 형태와 무관한 별개의 조건이다 —
 * 점수 0 은 정상 값이라 `Map` 으로 바꿔도 `get(id) || 0` 은 똑같이 틀린다.
 */
export type PersonalFitScoresByMerchantId = Readonly<Record<string, number>>;

/**
 * 점수를 낼 수 없어 시민 전체를 비활성으로 돌린 이유.
 *
 * 계약의 `ApiErrorCode` 와 섞지 않는다 — 이것은 HTTP 로 나가는 오류가 아니라 정상적인
 * 준비 결과의 일부이고, 이 신호는 비활성일 때 오류가 아니라 점수 0 을 낸다.
 */
export type PersonalFitDisabledReason =
  /** 사건의 구조가 잘못되었거나 같은 거래·revision 의 내용이 서로 어긋난다 */
  | 'INVALID_HISTORY'
  /** 정제하고 나니 쓸 수 있는 사건이 남지 않았다 */
  | 'NO_HISTORY'
  /** 그 시점 조건을 만족하는 벡터를 찾지 못했다 */
  | 'MISSING_VECTOR'
  /** 찾은 벡터가 서로 어긋나거나 명세·차원·값·노름이 쓸 수 없는 상태다 */
  | 'INVALID_VECTOR'
  /** 이력과 벡터는 성했으나 프로필이 서지 않았다(가중치 합 무효, 노름 상쇄 등) */
  | 'INVALID_PROFILE';

/**
 * 준비 결과의 공통 부분.
 *
 * 활성과 비활성이 같은 모양을 진다. "모든 후보의 점수가 있다" 를 한쪽에서만 지키면
 * 계산이 중간에 끊긴 결과와 원래 비활성인 결과가 구분되지 않아, 일부 후보만 든 점수
 * 맵이 정상 결과인 척 나갈 자리가 생긴다.
 *
 * 후보 목록을 결과가 함께 드는 것은 재준비 경계 때문이다. 후보 집합이 달라지면 다시
 * 준비해야 하는데, 무엇에 대해 준비한 결과인지가 결과 안에 없으면 달라졌다는 것을
 * 결과만 보고는 알 수 없다.
 */
interface PreparedPersonalFitBase {
  readonly citizenId: string;
  /** 준비 시점의 후보 집합. 이 집합이 달라지면 다시 준비해야 한다 */
  readonly candidates: readonly PersonalFitCandidateRef[];
  readonly asOf: number;
  readonly signalVersion: typeof PERSONAL_FIT_SIGNAL_VERSION;
  /** 모든 후보 가게 ID 의 점수가 있다. 비활성이면 전부 0 이다 */
  readonly scoresByMerchantId: PersonalFitScoresByMerchantId;
}

/**
 * 점수를 계산한 결과. 이유 없음을 필드 생략이 아니라 `null` 로 적는다 — 생략하면 "이유가
 * 없다" 와 "이유를 넣는 것을 빠뜨렸다" 가 읽는 쪽에서 둘 다 `undefined` 로 온다.
 */
export interface EnabledPersonalFit extends PreparedPersonalFitBase {
  readonly enabled: true;
  readonly reason: null;
}

/** 점수를 낼 수 없어 전 후보를 0 으로 채운 결과. 이유는 반드시 있다. */
export interface DisabledPersonalFit extends PreparedPersonalFitBase {
  readonly enabled: false;
  readonly reason: PersonalFitDisabledReason;
}

/**
 * 준비 결과. `enabled` 로 갈리는 판별 유니온이라, 활성 결과에서 `reason` 을 읽으면
 * `null` 임이 타입으로 드러나고 비활성 결과에서 이유를 빠뜨릴 수 없다.
 */
export type PreparedPersonalFit = EnabledPersonalFit | DisabledPersonalFit;

/**
 * 개인화 신호가 요구하는 주변값. 기존 `random` 을 그대로 물려받되 이 신호는 쓰지 않는다 —
 * 결합 엔진이 한 발급에서 모든 신호에 같은 context 하나를 넘기므로, 난수를 쓰는 신호와
 * 함께 등록되려면 난수 자리가 있어야 한다.
 *
 * 시민별 준비 결과를 요청·테스트 단위로 주입한다. 모듈 전역에 사용자별 상태를 두면
 * 한 요청의 준비 결과가 다음 요청에 남는다.
 *
 * 조회 맵은 점수 맵과 달리 `Map` 이다. 복사·동결 의무는 준비 함수가 만들어 내보내는
 * 결과에 걸리는 것이고 호출자가 요청마다 조립하는 이 맵에는 걸리지 않으므로, 동결이
 * 헛도는 `Map` 의 약점이 여기서는 대가가 되지 않는다. 대신 시민 ID 로 찾을 때
 * 프로토타입 키에 걸리지 않는 `get`·`has` 를 공짜로 얻는다.
 */
export interface PersonalFitContext extends SignalContext {
  readonly personalFitByCitizenId: ReadonlyMap<string, PreparedPersonalFit>;
}
