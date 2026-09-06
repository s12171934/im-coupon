import { useEffect, useMemo, useState } from "react";
import {
  CONSUMPTION_PATH,
  type ConsumptionActionResponse,
  type ConsumptionSnapshot,
  type Coupon,
  type PointEntry,
} from "@im-coupon/contracts";

import "../app.css";

const EMPTY: ConsumptionSnapshot = {
  coupons: [],
  paybackAmount: 0,
  ownerRewardAmount: 0,
  pointEntries: [],
};

type ConsumptionAction = (
  path: string,
  body?: unknown,
  method?: string,
) => Promise<void>;

export function ConsumptionPage() {
  const [snapshot, setSnapshot] = useState<ConsumptionSnapshot>(EMPTY);
  const [notice, setNotice] = useState(
    "쿠폰이 도착하면 여기서 메시지로 확인할 수 있어요.",
  );
  const [ownerName, setOwnerName] = useState("민지");
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  useEffect(() => {
    fetch(CONSUMPTION_PATH)
      .then((response) => response.json() as Promise<ConsumptionSnapshot>)
      .then(setSnapshot)
      .catch(() =>
        setNotice("API에 연결하지 못했습니다. 개발 서버를 실행해 주세요."),
      );
  }, []);

  const ownerCoupon = useMemo(
    () =>
      snapshot.coupons.find((coupon) => coupon.status === "owner_hold") ?? null,
    [snapshot.coupons],
  );
  const publicCoupons = useMemo(
    () =>
      snapshot.coupons.filter(
        (coupon) => coupon.status === "public" || coupon.status === "reserved",
      ),
    [snapshot.coupons],
  );
  const selectedCoupon =
    publicCoupons.find((coupon) => coupon.id === selectedCouponId) ??
    publicCoupons[0] ??
    null;
  const bCoupon =
    selectedCoupon?.status === "reserved" &&
    selectedCoupon.reservedBy === "준호"
      ? selectedCoupon
      : null;
  const aEntries = snapshot.pointEntries.filter(
    (entry) => entry.recipientName === ownerName,
  );
  const bEntries = snapshot.pointEntries.filter(
    (entry) => entry.recipientName === "준호",
  );

  const act: ConsumptionAction = async (path, body, method = "POST") => {
    const response = await fetch(`${CONSUMPTION_PATH}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json()) as ConsumptionActionResponse;
    if (!response.ok) throw new Error("요청을 처리하지 못했습니다.");
    setSnapshot(result);
    setNotice(result.message);
  };

  async function reset(): Promise<void> {
    if (window.confirm("쿠폰과 페이백·리워드 내역을 모두 초기화할까요?"))
      await act("", undefined, "DELETE");
  }

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div>
          <span className="eyebrow">iM COUPON · CONSUMPTION DEMO</span>
          <h1>소유자와 공용 풀 소비 시연</h1>
        </div>
        <span className="route-chip">/consumption</span>
      </header>
      <section className="scenario-row" aria-label="A 사용자 흐름">
        <ControlPanel
          ownerName={ownerName}
          setOwnerName={setOwnerName}
          ownerCoupon={ownerCoupon}
          onAct={act}
          onReset={reset}
        />
        <MessagePhone
          person="A · 원소유자"
          coupon={ownerCoupon}
          notice={notice}
          mode="owner"
          onAct={act}
        />
        <PointPanel
          title="A의 혜택"
          entries={aEntries}
          empty="아직 받은 혜택이 없어요."
        />
      </section>
      <section
        className="scenario-row pool-row"
        aria-label="공용 풀 사용자 흐름"
      >
        <PublicPool
          coupons={publicCoupons}
          selectedId={selectedCoupon?.id ?? null}
          onSelect={setSelectedCouponId}
          onAct={act}
        />
        <MessagePhone
          person="B · 공용 풀 이용자"
          coupon={bCoupon}
          notice={notice}
          mode="public"
          onAct={act}
        />
        <PointPanel
          title="B의 혜택"
          entries={bEntries}
          empty="아직 받은 혜택이 없어요."
        />
      </section>
    </main>
  );
}

function ControlPanel({
  ownerName,
  setOwnerName,
  ownerCoupon,
  onAct,
  onReset,
}: {
  ownerName: string;
  setOwnerName(value: string): void;
  ownerCoupon: Coupon | null;
  onAct: ConsumptionAction;
  onReset(): Promise<void>;
}) {
  return (
    <section className="control-panel">
      <span className="panel-label">A · MVP CONTROLS</span>
      <h2>소유자 쿠폰 조작</h2>
      <p>소유자 전용 기한이 끝나면 시스템이 공용 풀에 자동 공개합니다.</p>
      <label>
        소유자 이름
        <input
          value={ownerName}
          onChange={(event) => setOwnerName(event.target.value)}
        />
      </label>
      <button
        className="primary"
        onClick={() =>
          ownerName.trim() &&
          onAct("/coupons", {
            ownerName: ownerName.trim(),
            merchantName: "동성로 치킨집",
            requiredSpendAmount: 8000,
            rewardAmount: 1000,
          })
        }
      >
        8,000원 결제 · 1,000원 페이백 권리 발급
      </button>
      <button className="reset" onClick={onReset}>
        전체 소비 데이터 초기화
      </button>
      <div className="divider" />
      {ownerCoupon ? (
        <>
          <CouponSummary coupon={ownerCoupon} />
          <button
            onClick={() =>
              onAct(`/coupons/${ownerCoupon.id}/simulate-owner-expiry`)
            }
          >
            소유자 기한 만료 시뮬레이션
          </button>
        </>
      ) : (
        <p className="muted">A가 보유한 쿠폰이 없습니다.</p>
      )}
    </section>
  );
}

function PublicPool({
  coupons,
  selectedId,
  onSelect,
  onAct,
}: {
  coupons: Coupon[];
  selectedId: string | null;
  onSelect(id: string): void;
  onAct: ConsumptionAction;
}) {
  return (
    <section className="control-panel pool-panel">
      <span className="panel-label">B · PUBLIC POOL</span>
      <h2>공용 풀 쿠폰</h2>
      <p>공개된 페이백 권리를 찜해 사용할 수 있습니다.</p>
      {coupons.length === 0 ? (
        <p className="muted">아직 공용 풀 쿠폰이 없습니다.</p>
      ) : (
        coupons.map((coupon) => (
          <article
            key={coupon.id}
            className={`pool-item ${coupon.id === selectedId ? "selected" : ""} ${coupon.status === "reserved" ? "reserved" : ""}`}
          >
            <button className="pool-select" onClick={() => onSelect(coupon.id)}>
              <span className="pool-status">
                {coupon.status === "reserved" ? "✓ B가 찜한 쿠폰" : "공용 풀"}
              </span>
              <b>{coupon.merchantName}</b>
              <small>
                {coupon.requiredSpendAmount.toLocaleString()}원 결제 시{" "}
                {Math.round(coupon.rewardAmount * 0.8).toLocaleString()}원
                페이백
              </small>
            </button>
            {coupon.status === "public" ? (
              <button
                className="pool-action"
                onClick={() =>
                  onAct(`/coupons/${coupon.id}/reserve`, {
                    consumerName: "준호",
                  })
                }
              >
                찜하기
              </button>
            ) : (
              <div className="reserved-guide">
                <b>결제 준비 완료</b>
                <span>문자 카드에서 바코드를 확인해 주세요.</span>
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}

function MessagePhone({
  person,
  coupon,
  notice,
  mode,
  onAct,
}: {
  person: string;
  coupon: Coupon | null;
  notice: string;
  mode: "owner" | "public";
  onAct: ConsumptionAction;
}) {
  const payback = coupon
    ? mode === "public"
      ? Math.round(coupon.rewardAmount * 0.8)
      : coupon.rewardAmount
    : 0;
  return (
    <section className="phone-panel">
      <div className="phone">
        <div className="phone-notch" />
        <div className="message-top">
          <span>‹</span>
          <div>
            <b>{person}</b>
            <small>iM 상생 메시지</small>
          </div>
          <span>ⓘ</span>
        </div>
        <div className="messages">
          <p className="time">오늘 오전 10:24</p>
          <div className="bubble incoming">
            {mode === "owner"
              ? "페이백 권리가 도착했어요."
              : coupon
                ? "B님이 공용 풀 쿠폰을 찜했어요."
                : "공용 풀 쿠폰을 찜하면 여기에 메시지가 도착해요."}
          </div>
          {coupon ? (
            <div className="coupon-message">
              <span>
                {mode === "owner" ? "나의 페이백 권리" : "공용 풀 페이백 권리"}
              </span>
              <strong>{coupon.merchantName}</strong>
              <b>
                {coupon.requiredSpendAmount.toLocaleString()}원 결제 시{" "}
                {payback.toLocaleString()}원 페이백
              </b>
              <small>
                {mode === "owner"
                  ? "소유자 전용 기한 안에 사용할 수 있어요."
                  : "찜한 뒤 결제하면 지역화폐로 페이백됩니다."}
              </small>
              <div
                className="barcode"
                aria-label={`바코드 번호 ${barcodeNumber(coupon.id)}`}
              />
              <em className="barcode-number">{barcodeNumber(coupon.id)}</em>
              <button
                className="message-pay"
                onClick={() =>
                  onAct(`/coupons/${coupon.id}/consume`, {
                    consumerName: mode === "owner" ? coupon.ownerName : "준호",
                  })
                }
              >
                이 쿠폰으로 결제 완료
              </button>
            </div>
          ) : (
            <p className="muted">아직 찜한 공용 풀 쿠폰이 없습니다.</p>
          )}
          {(mode === "owner" || coupon) && (
            <div className="bubble incoming">{notice}</div>
          )}
        </div>
        <div className="message-input">
          <span>＋</span>
          <span>iMessage</span>
          <b>↑</b>
        </div>
      </div>
    </section>
  );
}

function PointPanel({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: PointEntry[];
  empty: string;
}) {
  const [historyKind, setHistoryKind] = useState<
    "consumer-payback" | "owner-reward"
  >("consumer-payback");
  const regionalCurrency = entries
    .filter((entry) => entry.kind === "consumer-payback")
    .reduce((total, entry) => total + entry.amount, 0);
  const points = entries
    .filter((entry) => entry.kind === "owner-reward")
    .reduce((total, entry) => total + entry.amount, 0);
  const filteredEntries = entries.filter((entry) => entry.kind === historyKind);
  return (
    <section className="reward-panel">
      <span className="panel-label">MY BENEFITS</span>
      <h2>{title}</h2>
      <div className="wallet-grid">
        <div className="points-card">
          <span>지역화폐</span>
          <strong>
            {regionalCurrency.toLocaleString()}
            <small>원</small>
          </strong>
          <p>결제 뒤 지급된 페이백</p>
        </div>
        <div className="points-card point-card">
          <span>포인트</span>
          <strong>
            {points.toLocaleString()}
            <small>P</small>
          </strong>
          <p>소유자 리워드로 적립</p>
        </div>
      </div>
      <div className="history">
        <h3>최근 내역</h3>
        <div
          className="history-segment"
          role="tablist"
          aria-label="혜택 내역 구분"
        >
          <button
            className={historyKind === "consumer-payback" ? "active" : ""}
            onClick={() => setHistoryKind("consumer-payback")}
          >
            지역화폐
          </button>
          <button
            className={historyKind === "owner-reward" ? "active" : ""}
            onClick={() => setHistoryKind("owner-reward")}
          >
            포인트
          </button>
        </div>
        {filteredEntries.length === 0 ? (
          <p className="muted">
            {entries.length === 0 ? empty : "해당 내역이 없습니다."}
          </p>
        ) : (
          filteredEntries.slice(0, 3).map((entry) => (
            <div key={entry.id}>
              <span>
                {entry.kind === "consumer-payback"
                  ? "지역화폐 페이백"
                  : "포인트 적립"}
              </span>
              <b>
                +{entry.amount.toLocaleString()}
                {entry.kind === "consumer-payback" ? "원" : "P"}
              </b>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function CouponSummary({ coupon }: { coupon: Coupon }) {
  return (
    <div className="coupon-summary">
      <span>{coupon.ownerName} 소유</span>
      <b>{coupon.merchantName}</b>
      <strong>
        {coupon.requiredSpendAmount.toLocaleString()}원 결제 ·{" "}
        {coupon.rewardAmount.toLocaleString()}원 페이백
      </strong>
    </div>
  );
}

function barcodeNumber(couponId: string): string {
  let hash = 0;
  for (const character of couponId)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `880${String(hash).padStart(10, "0").slice(-10)}`;
}
