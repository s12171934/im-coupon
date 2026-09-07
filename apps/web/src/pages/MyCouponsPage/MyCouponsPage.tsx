import { useState } from 'react';

import { CouponCard } from '../../features/my-coupons/components/CouponCard/CouponCard';
import { ErrorNotice } from '../../shared/components/ErrorNotice/ErrorNotice';
import { OwnerSelect } from '../../features/my-coupons/components/OwnerSelect/OwnerSelect';
import { useCitizens } from '../../features/my-coupons/hooks/use-citizens';
import { useMyCoupons } from '../../features/my-coupons/hooks/use-my-coupons';

/**
 * 내 쿠폰 화면 (`CP-06-05`, 설계문서 11장 와이어프레임). 훅과 UI 전용 컴포넌트를 조립만
 * 한다 — `fetch` 를 직접 부르지 않고, 요청·상태·오류 판단은 전부 `useCitizens`·
 * `useMyCoupons` 가 진다 (4장 결정 10).
 *
 * 저장소 상태를 받지 않는다. 그것은 탭을 가로질러 공유되는 관리 성격의 상태라 시연·관리
 * 시점 화면인 발급 실행 화면의 몫이다 (11장 두 화면의 구분).
 */
export function MyCouponsPage() {
  /*
    선택된 소유자 id 는 화면이 든다. 소유자 선택(`CP-06-01`)은 값을 받아 그리기만 하고
    `useMyCoupons` 는 그것을 인자로만 받으므로, 둘을 잇는 이 상태가 앉을 자리는 조립
    층뿐이다 — `IssuePage` 가 가중치 입력 초안을 드는 것과 같다 (4장 결정 10).
    초기값 `null` 이 "아직 아무도 선택하지 않음"이다.
  */
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const { state: citizens } = useCitizens();
  const { state: coupons } = useMyCoupons(ownerId);

  /* 헤딩 레벨은 층을 따른다 — 탭 셸 `h1` · 화면 조립 `h2` · 컴포넌트 `h3` 이하 (10장) */
  return (
    <>
      <h2>내 쿠폰 — 시민 시점</h2>
      {citizens.status === 'loading' && <p role="status">시민 목록을 불러오는 중…</p>}
      {/*
        시민 목록 실패는 화면 전체를 막는다 — 소유자를 고를 수 없으면 쿠폰 목록에 의미가
        없다. 소유자 선택부터 아래를 통째로 `loaded` 갈래 안에 두어, 이 상황에서는 쿠폰
        오류가 나올 자리 자체가 없다. 그래서 오류 둘이 겹쳐 보이는 조합이 만들어지지 않는다.
      */}
      {citizens.status === 'failed' && (
        <ErrorNotice code={citizens.error.code} message={citizens.error.message} />
      )}
      {citizens.status === 'loaded' && (
        <>
          {/*
            조회 중에도 선택을 잠그지 않는다. 소유자를 바꾸는 것이 `useMyCoupons` 의
            유일한 재조회 트리거이고, 그 훅이 앞 소유자의 늦은 응답을 스스로 걷어낸다 —
            잠그면 훅이 이미 감당하는 전환을 화면이 막는 셈이 된다.
          */}
          <OwnerSelect citizens={citizens.citizens} value={ownerId} onChange={setOwnerId} />
          {/*
            훅의 상태가 판별 유니온이라 목록·빈 상태·오류가 동시에 그려질 수 없다
            (화면은 조립만 하고 이 배타성을 스스로 만들지 않는다 — 4장 결정 10).
          */}
          {coupons.status === 'unselected' && <p>소유자를 선택하면 그 시민의 쿠폰을 보여줍니다</p>}
          {coupons.status === 'loading' && <p role="status">쿠폰을 불러오는 중…</p>}
          {coupons.status === 'failed' && (
            <ErrorNotice code={coupons.error.code} message={coupons.error.message} />
          )}
          {coupons.status === 'loaded' && <CouponList coupons={coupons.coupons} />}
        </>
      )}
    </>
  );
}

/**
 * 쿠폰 카드를 세로로 반복하는 배치다. 카드는 한 장만 그리므로 이 반복이 조립 층의 몫이다
 * (와이어프레임의 "같은 소유자의 쿠폰이 여러 건이면 …" 은 그림 주석이라 화면에 옮기지 않는다 — 11장).
 *
 * `ul`/`li` 로 감싸지 않는다. `CouponCard` 가 이미 `article` 이고 가맹점명을 접근 가능한
 * 이름으로 들어 항목의 경계와 정체를 스스로 지니므로, 목록 요소가 더하는 것은 항목 수
 * 안내 하나다. 그 하나를 얻는 대가로 기본 목록 표식과 들여쓰기가 카드 옆에 붙는데, 이
 * 저장소에는 그것을 지울 스타일시트가 없다 — 거래조건 고지를 장식 없는 본문으로 두라는
 * 규칙(10장) 옆에 지우지 못하는 표식을 세우게 된다.
 */
function CouponList({ coupons }: { coupons: Parameters<typeof CouponCard>[0][] }) {
  if (coupons.length === 0) {
    /*
      빈 상태 문구는 이 자리에만 쓴다. 소유자를 고르지 않은 것과 골랐는데 쿠폰이 없는 것은
      다른 사실이고, 뭉치면 사용자가 없는 쿠폰을 확인한 것으로 읽는다 — `useMyCoupons` 가
      `'unselected'` 를 갈래로 세운 것이 같은 이유다.
    */
    return <p>발급된 쿠폰이 없습니다</p>;
  }

  /* 다시 정렬하지 않는다 — `issuedAt` 내림차순은 서버가 지는 계약이다 (설계문서 8장). */
  return (
    <>
      {coupons.map((coupon) => (
        <CouponCard key={coupon.id} {...coupon} />
      ))}
    </>
  );
}
