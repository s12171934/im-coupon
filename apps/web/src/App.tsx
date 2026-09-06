import { useEffect, useMemo, useState } from "react";
import {
  CONSUMPTION_PATH,
  type ConsumptionActionResponse,
  type ConsumptionSnapshot,
  type Coupon,
} from "@im-coupon/contracts";
import "./app.css";

const EMPTY: ConsumptionSnapshot = {
  coupons: [],
  paybackAmount: 0,
  ownerRewardAmount: 0,
  pointEntries: [],
};

export function App() {
  return <ConsumptionPage />;
}

function ConsumptionPage() {
  const [snapshot, setSnapshot] = useState<ConsumptionSnapshot>(EMPTY);
  const [notice, setNotice] = useState(
    "쿠폰이 도착하면 여기서 메시지로 확인할 수 있어요.",
  );
  const [ownerName, setOwnerName] = useState("민지");
  const [loading, setLoading] = useState(true);
  const available = useMemo(
    () =>
      snapshot.coupons.find((coupon) =>
        ["owner_hold", "public", "reserved"].includes(coupon.status),
      ) ?? null,
    [snapshot.coupons],
  );

  useEffect(() => {
    fetch(CONSUMPTION_PATH)
      .then((response) => response.json() as Promise<ConsumptionSnapshot>)
      .then(setSnapshot)
      .catch(() =>
        setNotice("API에 연결하지 못했습니다. 개발 서버를 실행해 주세요."),
      )
      .finally(() => setLoading(false));
  }, []);

  async function act(path: string, body?: unknown, method = "POST") {
    const response = await fetch(`${CONSUMPTION_PATH}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json()) as ConsumptionActionResponse;
    if (!response.ok) throw new Error("요청을 처리하지 못했습니다.");
    setSnapshot(result);
    setNotice(result.message);
  }

  async function resetConsumption(): Promise<void> {
    if (!window.confirm('쿠폰과 페이백·리워드 내역을 모두 초기화할까요?')) return;
    await act('', undefined, 'DELETE');
  }

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div>
          <span className="eyebrow">iM COUPON · CONSUMPTION DEMO</span>
          <h1>동네 소비가 혜택으로 돌아오는 순간</h1>
        </div>
        <span className="route-chip">/consumption</span>
      </header>
      <div className="demo-grid">
        <section className="control-panel" aria-label="MVP 조작 패널">
          <span className="panel-label">MVP CONTROLS</span>
          <h2>쿠폰을 움직여 보세요</h2>
          <p>
            소유자 전용 기한이 끝나면 시스템이 자동으로 공용 풀에 공개합니다.
          </p>
          <label>
            소유자 이름
            <input
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="소유자 이름"
            />
          </label>
        <button
            className="primary"
            onClick={() =>
              ownerName.trim() &&
              act("/coupons", {
                ownerName: ownerName.trim(),
                merchantName: "동성로 치킨집",
                requiredSpendAmount: 8000,
                rewardAmount: 1000,
              })
            }
        >
          8,000원 결제 · 1,000원 페이백 권리 발급
        </button>
        <button className="reset" onClick={resetConsumption}>
          전체 소비 데이터 초기화
        </button>
          <div className="divider" />
          <p className="small-title">현재 쿠폰</p>
          {available ? (
            <CouponSummary coupon={available} />
          ) : (
            <p className="muted">사용 가능한 쿠폰이 없습니다.</p>
          )}
          <button
            disabled={!available || available.status !== "owner_hold"}
            onClick={() =>
              available && act(`/coupons/${available.id}/simulate-owner-expiry`)
            }
          >
            소유자 기한 만료 시뮬레이션
          </button>
          <button
            disabled={!available || available.status !== "public"}
            onClick={() =>
              available &&
              act(`/coupons/${available.id}/reserve`, { consumerName: "준호" })
            }
          >
            공개 쿠폰 점유하기 · 준호
          </button>
          <button
            className="dark"
            disabled={!available || available.status === "public"}
            onClick={() =>
              available &&
              act(`/coupons/${available.id}/consume`, {
                consumerName:
                  available.status === "owner_hold"
                    ? (available.ownerName ?? "준호")
                    : "준호",
              })
            }
          >
            결제 완료 · 페이백 지급
          </button>
        </section>
        <section className="phone-panel" aria-label="쿠폰 메시지">
          <div className="phone">
            <div className="phone-notch" />
            <div className="message-top">
              <span>‹</span>
              <div>
                <b>iM 상생 쿠폰</b>
                <small>메시지</small>
              </div>
              <span>ⓘ</span>
            </div>
            <div className="messages">
              <p className="time">오늘 오전 10:24</p>
              <div className="bubble incoming">
                안녕하세요, 민지님. 동네에서 쓸 수 있는 페이백 권리가
                도착했어요.
              </div>
              {available && (
                <div className="coupon-message">
                  <span>
                    {available.status === "public"
                      ? "공용 풀 페이백 권리"
                      : "나의 페이백 권리"}
                  </span>
                  <strong>{available.merchantName}</strong>
                  <b>
                    {available.requiredSpendAmount.toLocaleString()}원 결제 시{" "}
                    {Math.round(available.rewardAmount * (available.status === "owner_hold" ? 1 : 0.8)).toLocaleString()}원 페이백
                  </b>
                  <small>결제 완료 후 지역화폐로 페이백됩니다.</small>
                  <div className="barcode" aria-label={`바코드 번호 ${barcodeNumber(available.id)}`} />
                  <em className="barcode-number">{barcodeNumber(available.id)}</em>
                </div>
              )}
              <div className="bubble incoming">{notice}</div>
            </div>
            <div className="message-input">
              <span>＋</span>
              <span>iMessage</span>
              <b>↑</b>
            </div>
          </div>
        </section>
        <section className="reward-panel" aria-label="지역화폐 페이백">
          <span className="panel-label">MY REWARD</span>
          <h2>지역화폐 페이백</h2>
          <div className="points-card">
            <span>지급된 페이백</span>
            <strong>
              {snapshot.paybackAmount.toLocaleString()}
              <small>원</small>
            </strong>
            <p>결제 완료 뒤 지급되는 혜택</p>
          </div>
          <div className="history">
            <h3>최근 지급</h3>
            {snapshot.pointEntries.filter((entry) => entry.kind === "consumer-payback").length === 0 ? (
              <p className="muted">아직 지급 내역이 없어요.</p>
            ) : (
              snapshot.pointEntries.filter((entry) => entry.kind === "consumer-payback").slice(0, 3).map((entry) => (
                <div key={entry.id}>
                  <span>지역화폐 페이백</span>
                  <b>
                    +{entry.amount.toLocaleString()}
                    원
                  </b>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      {loading && <p className="loading">쿠폰 정보를 불러오는 중…</p>}
    </main>
  );
}

function CouponSummary({ coupon }: { coupon: Coupon }) {
  return (
    <div className="coupon-summary">
      <span>
        {coupon.status === "public"
          ? "공용 풀"
          : coupon.status === "reserved"
            ? `${coupon.reservedBy} 점유`
            : `${coupon.ownerName} 소유`}
      </span>
      <b>{coupon.merchantName}</b>
      <strong>
        {coupon.requiredSpendAmount.toLocaleString()}원 결제 ·{" "}
        {coupon.rewardAmount.toLocaleString()}원 페이백
      </strong>
    </div>
  );
}

/** 시연용으로 쿠폰 ID를 13자리 숫자 바코드 번호로 안정적으로 바꾼다. */
function barcodeNumber(couponId: string): string {
  let hash = 0;
  for (const character of couponId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `880${String(hash).padStart(10, '0').slice(-10)}`;
}
