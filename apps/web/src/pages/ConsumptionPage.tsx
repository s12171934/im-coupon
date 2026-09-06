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

  useEffect(() => {
    fetch(CONSUMPTION_PATH)
      .then((response) => response.json() as Promise<ConsumptionSnapshot>)
      .then(setSnapshot)
      .catch(() =>
        setNotice("혜택 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
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
  const bCoupon =
    publicCoupons.find(
      (coupon) => coupon.status === "reserved" && coupon.reservedBy === "준호",
    ) ?? null;
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
          <span className="eyebrow">iM COUPON · REWARD MISSION</span>
          <h1>함께 누리는 리워드 미션</h1>
        </div>
        <span className="route-chip">리워드 미션</span>
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
          person="A · 처음 받은 사람"
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
        aria-label="이달의 미션 참여 흐름"
      >
        <PublicPool coupons={publicCoupons} onAct={act} />
        <MessagePhone
          person="B · 미션 참여자"
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
      <span className="panel-label">A · 리워드 미션</span>
      <h2>내 리워드 미션</h2>
      <p>내가 먼저 쓸 수 있는 기간이 지나면, 다른 사람도 쓸 수 있도록 자동으로 열려요.</p>
      <label>
        처음 받은 사람 이름
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
        8,000원 결제 후 1,000원 혜택 받기
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
            사용 기간이 끝난 모습 보기
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
  onAct,
}: {
  coupons: Coupon[];
  onAct: ConsumptionAction;
}) {
  return (
    <section className="control-panel pool-panel">
      <span className="panel-label">B · 이달의 미션</span>
      <h2>이달의 미션</h2>
      <p>이번 달, 함께 참여할 수 있는 혜택이에요.</p>
      <div className="pool-summary-row">
        <span>지금 사용할 수 있는 혜택</span>
        <b>{coupons.length}개</b>
      </div>
      {coupons.length === 0 ? (
        <p className="muted">진행 중인 이달의 미션이 없습니다.</p>
      ) : (
        coupons.map((coupon) => (
          <article
            key={coupon.id}
            className={`pool-item ${coupon.status === "reserved" ? "reserved" : ""}`}
          >
            <div className="pool-select">
              <div className="pool-card-top">
                <span className="pool-status">
                  {coupon.status === "reserved" ? "수행 준비 완료" : "참여 가능"}
                </span>
              </div>
              <div className="pool-merchant">
                <span aria-hidden="true">🍗</span>
                <div>
                  <b>{coupon.merchantName}</b>
                  <small>{coupon.requiredSpendAmount.toLocaleString()}원 이상 결제</small>
                </div>
              </div>
              <div className="pool-payback">
                <span>결제 후 페이백</span>
                <strong>+{Math.round(coupon.rewardAmount * 0.8).toLocaleString()}원</strong>
              </div>
            </div>
            {coupon.status === "public" ? (
              <button
                className="pool-action"
                onClick={() =>
                  onAct(`/coupons/${coupon.id}/reserve`, {
                    consumerName: "준호",
                  })
                }
              >
                이달의 미션 수행하기
              </button>
            ) : (
              <div className="reserved-guide">
                <b>✓ 미션을 시작할 준비가 됐어요</b>
                <span>오른쪽 문자 카드에서 바코드를 확인하고 결제하세요.</span>
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
              ? "사용할 수 있는 혜택이 도착했어요."
              : coupon
                ? "이달의 미션을 시작했어요."
                : "이달의 미션을 시작하면 여기에 메시지가 도착해요."}
          </div>
          {coupon ? (
            <div className="coupon-message">
              <span>
                {mode === "owner" ? "나의 페이백 혜택" : "이달의 페이백 혜택"}
              </span>
              <strong>{coupon.merchantName}</strong>
              <b>
                {coupon.requiredSpendAmount.toLocaleString()}원 결제 시{" "}
                {payback.toLocaleString()}원 페이백
              </b>
              <small>
                {mode === "owner"
                  ? "내가 먼저 쓸 수 있는 기간 안에 사용할 수 있어요."
                  : "미션을 수행한 뒤 지역화폐로 페이백됩니다."}
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
            <p className="muted">아직 시작한 미션이 없습니다.</p>
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
      <span className="panel-label">내 혜택</span>
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
          <p>처음 받은 사람에게 쌓인 혜택</p>
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
      <span>{coupon.ownerName}님이 먼저 사용 중</span>
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
