import type { SignalWeights } from '@im-coupon/contracts';

/**
 * 입력 중인 발급 가중치. 값을 문자열로 들어, 빈 칸("지정하지 않음")과 `0` 을 가른다.
 * 문자열을 숫자로 바꾸고 요청 본문을 만드는 것은 발급 호출 훅의 몫이고,
 * 여기서는 검증도 변환도 하지 않는다 — 값 규칙 위반은 서버가 `INVALID_WEIGHTS` 로 거부한다 (설계문서 8장).
 */
export type WeightsDraft = Record<keyof SignalWeights, string>;

/**
 * 신호별 화면 라벨. 키 집합을 `SignalWeights` 에서 끌어와, 이후 에픽이 신호를 더하면
 * 이 표가 컴파일 오류로 그 사실을 알린다 (설계문서 4장 결정 2).
 */
const SIGNAL_LABELS: Record<keyof SignalWeights, string> = {
  random: '랜덤 신호',
};

/** 신호 키 문자열이 흩어지지 않도록 라벨 표 하나에서 끌어온다. */
const SIGNAL_KEYS = Object.keys(SIGNAL_LABELS) as (keyof SignalWeights)[];

/** 가중치 결합 구조에 자리만 남아 있는 신호들. 이번 에픽은 구현하지 않는다 (설계문서 1장 범위 — 제외). */
const OUT_OF_SCOPE_SIGNALS = '사용자 소비 패턴 · 쿠폰 사용 패턴 · 가맹점 매출 · 가맹점 마케팅 수요';

export interface WeightsEditorProps {
  /** 신호별 입력 원문 */
  value: WeightsDraft;
  /** 입력이 바뀌면 그 신호 키와 입력 원문을 그대로 올린다 */
  onChange: (key: keyof SignalWeights, text: string) => void;
  /** 발급이 진행 중인 동안 입력을 잠근다 */
  disabled?: boolean;
}

export function WeightsEditor({ value, onChange, disabled = false }: WeightsEditorProps) {
  return (
    <section aria-label="발급 가중치">
      <h2>발급 가중치</h2>
      <p>요청 본문으로 덮어쓸 수 있습니다. 비워 두면 발급 파라미터 기본값으로 발급합니다.</p>
      {SIGNAL_KEYS.map((key) => (
        <p key={key}>
          <label htmlFor={inputId(key)}>{SIGNAL_LABELS[key]}</label>{' '}
          <input
            id={inputId(key)}
            /* 숫자 입력은 `abc` 같은 값을 빈 문자열로 만들어 "문자를 넣었다"와 "비웠다"를 뭉갠다. 원문을 그대로 올리려고 텍스트로 둔다 */
            type="text"
            inputMode="decimal"
            value={value[key]}
            disabled={disabled}
            onChange={(event) => onChange(key, event.target.value)}
          />
        </p>
      ))}
      <p>{OUT_OF_SCOPE_SIGNALS} — 이번 에픽 범위 밖입니다. 가중치 결합 구조에 자리만 남겨 둡니다.</p>
    </section>
  );
}

function inputId(key: keyof SignalWeights): string {
  return `weight-${key}`;
}
