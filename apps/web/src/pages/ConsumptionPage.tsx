import { useEffect, useRef, useState } from 'react';
import {
  CITIZENS_PATH, CONSUMPTION_PATH, ISSUE_COUPON_PATH, couponBenefits,
  type Citizen, type ConsumptionActionResponse, type ConsumptionSnapshot,
  type Coupon, type IssueCouponResponse, type ListCitizensResponse, type PointEntry,
} from '@im-coupon/contracts';
import '../app.css';
import './ConsumptionPage.css';
import { IssuedCouponCard } from '../features/issuance/components/IssuedCouponCard/IssuedCouponCard';

const EMPTY: ConsumptionSnapshot = { coupons: [], paybackAmount: 0, ownerRewardAmount: 0, pointEntries: [] };
type ConsumptionAction = (path: string, body?: unknown, method?: string) => Promise<void>;

export function ConsumptionPage() {
  const [snapshot, setSnapshot] = useState<ConsumptionSnapshot>(EMPTY);
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [consumerId, setConsumerId] = useState('');
  const [selectedCouponId, setSelectedCouponId] = useState('');
  const [notice, setNotice] = useState('쿠폰을 발급하거나 발급된 쿠폰을 선택해 소비를 시연하세요.');
  const [busy, setBusy] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueResult, setIssueResult] = useState<IssueCouponResponse | null>(null);
  const pending = useRef(false);
  const version = useRef(0);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (pending.current || refreshing) return;
      refreshing = true;
      const requestedVersion = version.current;
      try {
        const [next, directory] = await Promise.all([
          fetch(CONSUMPTION_PATH).then((response) => readResponse<ConsumptionSnapshot>(response)),
          fetch(CITIZENS_PATH).then((response) => readResponse<ListCitizensResponse>(response)),
        ]);
        if (!active) return;
        setCitizens(directory.citizens);
        if (requestedVersion !== version.current) return;
        setSnapshot(next);
        const firstOwnerId = next.coupons.find((coupon) => coupon.status === 'held')?.ownerId
          ?? next.coupons[0]?.ownerId ?? directory.citizens[0]?.id ?? '';
        setOwnerId((current) => current || firstOwnerId);
        setConsumerId((current) => current || directory.citizens.find((citizen) => citizen.id !== firstOwnerId)?.id || firstOwnerId);
      } catch {
        if (active && requestedVersion === version.current) setNotice('혜택 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    // 시간 경과에 따른 공개·점유 해제·만료를 화면에도 반영한다.
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const ownerCoupons = snapshot.coupons.filter((coupon) => coupon.status === 'held' && coupon.ownerId === ownerId);
  const ownerCoupon = ownerCoupons.find((coupon) => coupon.id === selectedCouponId) ?? ownerCoupons[0] ?? null;
  const publicCoupons = snapshot.coupons.filter((coupon) => coupon.status === 'public' || coupon.status === 'reserved');
  const consumerCoupon = publicCoupons.find((coupon) => coupon.status === 'reserved' && coupon.reservedById === consumerId) ?? null;
  const aEntries = snapshot.pointEntries.filter((entry) => entry.recipientId === ownerId);
  const bEntries = snapshot.pointEntries.filter((entry) => entry.recipientId === consumerId);

  const act: ConsumptionAction = async (path, body, method = 'POST') => {
    if (pending.current) return;
    pending.current = true;
    version.current += 1;
    setBusy(true);
    try {
      const result = await readResponse<ConsumptionActionResponse>(await fetch(`${CONSUMPTION_PATH}${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }));
      setSnapshot(result);
      setNotice(result.message);
      if (method === 'DELETE') setIssueResult(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  async function issue(): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    version.current += 1;
    setBusy(true);
    setIssuing(true);
    setIssueResult(null);
    let issued = false;
    try {
      const response = await fetch(ISSUE_COUPON_PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      issued = response.ok;
      const result = await readResponse<IssueCouponResponse>(response);
      const { coupon } = result;
      setIssueResult(result);
      setOwnerId(coupon.ownerId);
      setSelectedCouponId(coupon.id);
      const next = await readResponse<ConsumptionSnapshot>(await fetch(CONSUMPTION_PATH));
      setSnapshot(next);
      setNotice(`${coupon.ownerName}님에게 ${coupon.merchantName}의 ${coupon.faceValue.toLocaleString()}원 쿠폰이 발급됐습니다.`);
    } catch (error) {
      setNotice(issued
        ? '쿠폰은 발급됐지만 화면을 갱신하지 못했습니다. 새로고침해 발급된 쿠폰을 확인해 주세요.'
        : error instanceof Error ? `${error.message} 발급 여부를 확인한 뒤 다시 시도해 주세요.` : '발급 결과를 확인하지 못했습니다.');
    } finally {
      pending.current = false;
      setBusy(false);
      setIssuing(false);
    }
  }

  return (
    <main className="demo-shell" aria-busy={busy}>
      <header className="demo-header">
        <div><span className="eyebrow">iM COUPON</span><h1>발급된 쿠폰 사용하기</h1></div>
        <span className="route-chip">소비 시연</span>
      </header>
      <p role="status">{notice}</p>
      {issueResult && <IssuedCouponCard {...issueResult} />}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section className="scenario-row" aria-label="소유자 사용 흐름">
          <section className="control-panel">
            <span className="panel-label">A · 쿠폰 소유자</span>
            <h2>내 쿠폰 사용</h2>
            <p>소유자가 직접 사용하면 발급된 혜택 전액을 받습니다.</p>
            <button className="primary" onClick={issue}>{issuing ? '발급 중…' : '쿠폰 발급'}</button>
            <CitizenSelect label="쿠폰 소유자" citizens={citizens} value={ownerId} onChange={setOwnerId} />
            {ownerCoupons.length > 0 ? <>
              <label>사용할 쿠폰
                <select value={ownerCoupon?.id ?? ''} onChange={(event) => setSelectedCouponId(event.target.value)}>
                  {ownerCoupons.map((coupon) => <option key={coupon.id} value={coupon.id}>
                    {coupon.merchantName} · {coupon.faceValue.toLocaleString()}원 · {formatTime(coupon.issuedAt)}
                  </option>)}
                </select>
              </label>
              {ownerCoupon && <>
                <CouponTerms coupon={ownerCoupon} />
                <button onClick={() => act(`/coupons/${ownerCoupon.id}/simulate-owner-expiry`)}>소유자 기한 경과 시연</button>
              </>}
            </> : <p className="muted">소유자 전용 기간에 사용할 쿠폰이 없습니다.</p>}
            <button className="reset" onClick={() => {
              if (window.confirm('소비 시연의 쿠폰과 혜택을 초기화할까요? 발급 기록은 보존됩니다.')) void act('', undefined, 'DELETE');
            }}>소비 시연 초기화</button>
          </section>
          <MessagePhone person="A · 쿠폰 소유자" coupon={ownerCoupon} consumerId={ownerId} onAct={act} />
          <PointPanel title="A의 혜택" entries={aEntries} empty="아직 받은 혜택이 없어요." />
        </section>
        <section className="scenario-row pool-row" aria-label="공개 쿠폰 사용 흐름">
          <section className="control-panel pool-panel">
            <span className="panel-label">B · 쿠폰 소비자</span>
            <h2>공개 쿠폰</h2>
            <p>소유자 기한이 지난 쿠폰을 한 번에 한 장 점유해 사용할 수 있습니다.</p>
            <CitizenSelect label="쿠폰 소비자" citizens={citizens} value={consumerId} onChange={setConsumerId} />
            {publicCoupons.length === 0 ? <p className="muted">공개된 쿠폰이 없습니다.</p> : publicCoupons.map((coupon) => (
              <article className="public-coupon" key={coupon.id}>
                <header className="public-coupon-header">
                  <div>
                    <h3>{coupon.merchantName}</h3>
                    <span className="public-coupon-owner">원소유자: {coupon.ownerName}</span>
                  </div>
                  <span className={`public-coupon-badge${coupon.status === 'reserved' ? ' is-reserved' : ''}`}>
                    {coupon.status === 'public' ? '사용 가능' : '점유 중'}
                  </span>
                </header>
                <div className="public-coupon-benefit">
                  <span>결제 후 돌려받는 혜택</span>
                  <strong>{couponBenefits(coupon, consumerId).consumerAmount.toLocaleString()}<small>원 페이백</small></strong>
                </div>
                <CouponTerms coupon={coupon} />
                {coupon.status === 'public' ? <button className="public-coupon-action" disabled={!consumerId || !!consumerCoupon}
                  onClick={() => act(`/coupons/${coupon.id}/reserve`, { consumerId })}>쿠폰 점유하기</button>
                  : <p className="public-coupon-status">{coupon.reservedById === consumerId ? '내가 점유한 쿠폰입니다.' : '다른 시민이 점유한 쿠폰입니다.'}</p>}
                {coupon.status === 'public' && consumerCoupon && <p className="public-coupon-hint">점유한 쿠폰을 사용한 뒤 선택할 수 있어요.</p>}
              </article>
            ))}
          </section>
          <MessagePhone person="B · 쿠폰 소비자" coupon={consumerCoupon} consumerId={consumerId} onAct={act} />
          <PointPanel title="B의 혜택" entries={bEntries} empty="아직 받은 혜택이 없어요." />
        </section>
      </fieldset>
    </main>
  );
}

function CitizenSelect({ label, citizens, value, onChange }: {
  label: string; citizens: Citizen[]; value: string; onChange(value: string): void;
}) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="" disabled>시민을 선택하세요</option>
    {citizens.map((citizen) => <option key={citizen.id} value={citizen.id}>{citizen.name} ({citizen.id})</option>)}
  </select></label>;
}

function CouponTerms({ coupon }: { coupon: Coupon }) {
  return <div className="coupon-terms">
    <dl>
      <div className="coupon-terms-total"><dt>총 혜택</dt><dd>{coupon.faceValue.toLocaleString()}원</dd></div>
      <div><dt>직접 사용</dt><dd>혜택 전액</dd></div>
      <div><dt>타인 사용</dt><dd>소유자 {Number((coupon.benefitSplit.ownerRatio * 100).toFixed(10))}% · 소비자 {Number((coupon.benefitSplit.consumerRatio * 100).toFixed(10))}%</dd></div>
    </dl>
    <dl className="coupon-terms-dates">
      <div><dt>소유자 전용 기한</dt><dd><time dateTime={coupon.heldUntil}>{formatTime(coupon.heldUntil)}</time></dd></div>
      <div><dt>사용 기한</dt><dd><time dateTime={coupon.expiresAt}>{formatTime(coupon.expiresAt)}</time></dd></div>
      {coupon.reservationExpiresAt && <div><dt>점유 기한</dt><dd><time dateTime={coupon.reservationExpiresAt}>{formatTime(coupon.reservationExpiresAt)}</time></dd></div>}
    </dl>
    {coupon.ownerReleasedAt && <p className="coupon-terms-note">소유자 기한 경과 시연이 적용됐습니다.</p>}
  </div>;
}

function MessagePhone({ person, coupon, consumerId, onAct }: {
  person: string; coupon: Coupon | null; consumerId: string; onAct: ConsumptionAction;
}) {
  return <section className="phone-panel"><div className="phone">
    <div className="phone-notch" />
    <div className="message-top"><b>{person}</b></div>
    <div className="messages">
      {coupon ? <div className="coupon-message">
        <span>{coupon.ownerId === consumerId ? coupon.ownerName : '공개 쿠폰 소비자'}님의 페이백 혜택</span>
        <strong>{coupon.merchantName}</strong>
        <b>결제 후 {couponBenefits(coupon, consumerId).consumerAmount.toLocaleString()}원 페이백</b>
        <p>사용 기한: {formatTime(coupon.expiresAt)}</p>
        {coupon.reservationExpiresAt && <p>점유 기한: {formatTime(coupon.reservationExpiresAt)}</p>}
        <div className="barcode" aria-label={`바코드 번호 ${barcodeNumber(coupon.id)}`} />
        <em className="barcode-number">{barcodeNumber(coupon.id)}</em>
        <button className="message-pay" disabled={!consumerId}
          onClick={() => onAct(`/coupons/${coupon.id}/consume`, { consumerId })}>이 쿠폰으로 결제 시연</button>
      </div> : <p className="muted">사용할 쿠폰을 선택하거나 점유해 주세요.</p>}
    </div>
  </div></section>;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error?.message === 'string' ? body.error.message
    : typeof body.message === 'string' ? body.message : '요청을 처리하지 못했습니다.');
  return body as T;
}

function formatTime(value: string): string {
  return `${new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ')} KST`;
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

function barcodeNumber(couponId: string): string {
  let hash = 0;
  for (const character of couponId)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `880${String(hash).padStart(10, "0").slice(-10)}`;
}
