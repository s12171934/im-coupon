import type { SignalWeights } from '@im-coupon/contracts';

import { SIGNAL_KEYS, SIGNAL_LABELS } from '../../model/signal-labels';

/**
 * 입력 중인 발급 가중치. 값을 문자열로 들어, 빈 칸("지정하지 않음")과 `0` 을 가른다.
 * 문자열을 숫자로 바꾸고 요청 본문을 만드는 것은 발급 호출 훅의 몫이고,
 * 여기서는 검증도 변환도 하지 않는다 — 값 규칙 위반은 서버가 `INVALID_WEIGHTS` 로 거부한다 (설계문서 8장).
 */
export type WeightsDraft = Record<keyof SignalWeights, string>;

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
      <p>비워 두면 기본 가중치를 사용합니다. 상권회복과 개인화 점수를 가중평균으로 결합합니다.</p>
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
    </section>
  );
}

function inputId(key: keyof SignalWeights): string {
  return `weight-${key}`;
}
