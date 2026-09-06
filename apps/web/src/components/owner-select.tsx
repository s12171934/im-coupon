import type { Citizen } from '@im-coupon/contracts';

/** 라벨과 컨트롤을 잇는 id. 이 컴포넌트는 화면에 한 번만 놓이므로 고정 문자열로 둔다 */
const SELECT_ID = 'owner-select';

/**
 * "아직 아무도 선택하지 않음"을 그리는 선택지의 값. 시민 `id` 는 `cit-` 접두를 가지므로
 * (설계문서 7장 `citizens`) 빈 문자열이 실제 소유자 id 와 겹칠 일이 없다.
 */
const NO_SELECTION = '';

export interface OwnerSelectProps {
  /** 고를 수 있는 시민 목록 */
  citizens: Citizen[];
  /** 선택된 소유자 id. 아직 아무도 선택하지 않았으면 `null` */
  value: string | null;
  /** 선택이 바뀌면 그 시민의 id 를 올린다 */
  onChange: (ownerId: string) => void;
  /** 조회가 진행 중인 동안 선택을 잠근다 */
  disabled?: boolean;
}

/**
 * 와이어프레임의 소유자 선택이다 (설계문서 11장). 프로토타입에 로그인이 없어 시민 선택이
 * 로그인을 대신한다 (8장 시민 목록). props 만 받아 그리는 UI 전용 컴포넌트다 —
 * fetch·상태 로직을 갖지 않는다 (4장 결정 10).
 *
 * 선택 상태를 스스로 들지 않는 제어 컴포넌트다. 목록을 가져오는 것은 `CP-06-03`,
 * 선택된 소유자 id 를 드는 것은 화면 조립 `CP-06-05` 의 몫이다.
 */
export function OwnerSelect({ citizens, value, onChange, disabled = false }: OwnerSelectProps) {
  return (
    <p>
      <label htmlFor={SELECT_ID}>소유자 선택</label>{' '}
      <select
        id={SELECT_ID}
        /*
          `value` 가 `null`(선택 전)이거나 목록에 없는 id 이면 어느 선택지와도 짝이 맞지
          않아 아무 것도 고르지 않은 상태로 그려진다. 목록이 갱신되며 선택된 시민이
          사라져도 엉뚱한 시민이 선택된 것처럼 보이지 않는 것이 그 덕이다.
        */
        value={value ?? NO_SELECTION}
        disabled={disabled}
        onChange={(event) => {
          /*
            플레이스홀더는 선택 전 상태를 그리는 자리일 뿐 소유자가 아니다. 그 값을 그대로
            올리면 화면 조립이 빈 소유자로 조회를 날려 `MISSING_OWNER_ID` 를 받는다
            (설계문서 8장 내 쿠폰 조회).
          */
          if (event.target.value !== NO_SELECTION) onChange(event.target.value);
        }}
      >
        {/*
          고를 시민이 없다는 사실은 잠금이 아니라 이 문구로 알린다 — `disabled` 를 조회 중
          잠그는 뜻 하나로 두어야, 조립이 잠근 것과 목록이 빈 것이 같은 표시로 뭉치지 않는다.
        */}
        <option value={NO_SELECTION}>
          {citizens.length === 0 ? '고를 수 있는 시민이 없습니다' : '시민을 선택하세요'}
        </option>
        {/* 정렬하지 않는다 — 시민 목록은 시드에 든 순서 그대로가 계약이다 (설계문서 8장) */}
        {citizens.map((citizen) => (
          <option key={citizen.id} value={citizen.id}>
            {citizen.name}
          </option>
        ))}
      </select>
    </p>
  );
}
