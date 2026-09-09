import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ConsumptionActionResponse,
  ConsumptionSnapshot,
  Coupon,
  IssueCouponRequest,
  PointEntry,
} from "@im-coupon/contracts";
import { JsonFileDb } from "@im-coupon/db";
import { DATA_DIR } from "../shared/infrastructure/data-dir.token";

/** 문서의 후보값을 시연 기본값으로 둔 정책. 값은 도메인 흐름과 분리한다. */
const POLICY = {
  ownerHoldHours: 72,
  validHours: 120,
  reservationHours: 3,
  ownerRewardRate: 0.2,
  consumerRewardRate: 0.8,
} as const;

@Injectable()
export class ConsumptionService {
  private readonly db: JsonFileDb;
  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  async snapshot(): Promise<ConsumptionSnapshot> {
    return this.current();
  }

  /** 시연 상태만 초기화한다. 시드 메타데이터와 파일 DB 자체는 지우지 않는다. */
  async reset(): Promise<ConsumptionActionResponse> {
    await Promise.all([
      this.db.writeCollection<Coupon>("coupons", []),
      this.db.writeCollection<PointEntry>("points", []),
    ]);
    return this.withMessage("쿠폰과 페이백·리워드 내역을 모두 초기화했습니다.");
  }

  async issue(request: IssueCouponRequest): Promise<ConsumptionActionResponse> {
    const coupons = await this.db.readCollection<Coupon>("coupons");
    const now = new Date();
    const coupon: Coupon = {
      id: `coupon-${Date.now()}`,
      issuerName: "iM 상생 쿠폰",
      ownerName: request.ownerName,
      reservedBy: null,
      merchantName: request.merchantName,
      title: "소유자 전용 상생 쿠폰",
      requiredSpendAmount: request.requiredSpendAmount,
      rewardAmount: request.rewardAmount,
      status: "owner_hold",
      issuedAt: now.toISOString(),
      usedAt: null,
      ownerExclusiveUntil: new Date(
        now.getTime() + POLICY.ownerHoldHours * 3600000,
      ).toISOString(),
      expiresAt: new Date(
        now.getTime() + POLICY.validHours * 3600000,
      ).toISOString(),
      reservationExpiresAt: null,
    };
    await this.db.writeCollection("coupons", [coupon, ...coupons]);
    return this.withMessage(
      `${coupon.ownerName}님에게 쿠폰이 발급됐습니다. 소유자 전용 기한 뒤에는 자동으로 공용 풀에 공개됩니다.`,
    );
  }

  async reserve(
    couponId: string,
    consumerName: string,
  ): Promise<ConsumptionActionResponse> {
    const coupons = await this.refreshLifecycle();
    const coupon = coupons.find(
      (item) => item.id === couponId && item.status === "public",
    );
    if (!coupon) throw new NotFoundException("공개된 쿠폰을 찾지 못했습니다.");
    if (
      coupons.some(
        (item) =>
          item.status === "reserved" && item.reservedBy === consumerName,
      )
    )
      throw new NotFoundException(
        "한 사람은 공개 쿠폰을 한 장만 점유할 수 있습니다.",
      );
    coupon.status = "reserved";
    coupon.reservedBy = consumerName;
    coupon.reservationExpiresAt = new Date(
      Date.now() + POLICY.reservationHours * 3600000,
    ).toISOString();
    await this.db.writeCollection("coupons", coupons);
    return this.withMessage(
      `${consumerName}님이 3시간 동안 이 쿠폰을 단독 점유했습니다.`,
    );
  }

  /** 시연용 시간 경과 조작이다. 실제 전이는 기한을 기준으로 자동 처리된다. */
  async simulateOwnerExpiry(
    couponId: string,
  ): Promise<ConsumptionActionResponse> {
    const coupons = await this.db.readCollection<Coupon>("coupons");
    const coupon = coupons.find(
      (item) => item.id === couponId && item.status === "owner_hold",
    );
    if (!coupon)
      throw new NotFoundException("소유자 전용 상태의 쿠폰을 찾지 못했습니다.");
    coupon.ownerExclusiveUntil = new Date(0).toISOString();
    await this.db.writeCollection("coupons", coupons);
    await this.refreshLifecycle();
    return this.withMessage(
      "소유자 전용 기한이 끝났습니다. 쿠폰이 자동으로 공용 풀에 공개됐습니다.",
    );
  }

  async consume(
    couponId: string,
    consumerName: string,
  ): Promise<ConsumptionActionResponse> {
    const coupons = await this.refreshLifecycle();
    const coupon = coupons.find(
      (item) =>
        item.id === couponId &&
        item.status !== "used" &&
        item.status !== "expired",
    );
    if (
      !coupon ||
      (coupon.status === "reserved" && coupon.reservedBy !== consumerName) ||
      coupon.status === "public"
    )
      throw new NotFoundException("사용 권한이 없는 쿠폰입니다.");
    if (coupon.status === "owner_hold" && coupon.ownerName !== consumerName)
      throw new NotFoundException(
        "소유자 전용 기간에는 소유자만 사용할 수 있습니다.",
      );
    coupon.status = "used";
    coupon.usedAt = new Date().toISOString();
    const entries = await this.db.readCollection<PointEntry>("points");
    const ownUse = coupon.ownerName === consumerName;
    const additions: PointEntry[] = [
      {
        id: `payback-${Date.now()}`,
        couponId,
        recipientName: consumerName,
        amount: Math.round(
          coupon.rewardAmount * (ownUse ? 1 : POLICY.consumerRewardRate),
        ),
        kind: "consumer-payback",
        earnedAt: coupon.usedAt,
      },
    ];
    if (!ownUse && coupon.ownerName)
      additions.push({
        id: `owner-reward-${Date.now()}`,
        couponId,
        recipientName: coupon.ownerName,
        amount: Math.round(coupon.rewardAmount * POLICY.ownerRewardRate),
        kind: "owner-reward",
        earnedAt: coupon.usedAt,
      });
    await Promise.all([
      this.db.writeCollection("coupons", coupons),
      this.db.writeCollection("points", [...additions, ...entries]),
    ]);
    return this.withMessage(
      ownUse
        ? "결제가 완료됐습니다. 혜택 전액이 지역화폐 페이백으로 지급됩니다."
        : "결제가 완료됐습니다. 지역화폐 페이백이 지급됩니다.",
    );
  }

  private async current(): Promise<ConsumptionSnapshot> {
    const coupons = await this.refreshLifecycle();
    const entries = await this.db.readCollection<PointEntry>("points");
    return {
      coupons,
      pointEntries: entries,
      paybackAmount: entries
        .filter((entry) => entry.kind === "consumer-payback")
        .reduce((total, entry) => total + entry.amount, 0),
      ownerRewardAmount: entries
        .filter((entry) => entry.kind === "owner-reward")
        .reduce((total, entry) => total + entry.amount, 0),
    };
  }
  private async withMessage(
    message: string,
  ): Promise<ConsumptionActionResponse> {
    return { ...(await this.current()), message };
  }
  private async refreshLifecycle(): Promise<Coupon[]> {
    const coupons = await this.db.readCollection<Coupon>("coupons");
    const now = Date.now();
    let changed = false;
    for (const coupon of coupons) {
      if (
        coupon.status === "owner_hold" &&
        new Date(coupon.ownerExclusiveUntil).getTime() <= now
      ) {
        coupon.status = "public";
        coupon.ownerName = coupon.ownerName;
        changed = true;
      }
      if (
        coupon.status === "reserved" &&
        coupon.reservationExpiresAt &&
        new Date(coupon.reservationExpiresAt).getTime() <= now
      ) {
        coupon.status = "public";
        coupon.reservedBy = null;
        coupon.reservationExpiresAt = null;
        changed = true;
      }
      if (
        coupon.status !== "used" &&
        new Date(coupon.expiresAt).getTime() <= now
      ) {
        coupon.status = "expired";
        changed = true;
      }
    }
    if (changed) await this.db.writeCollection("coupons", coupons);
    return coupons;
  }
}
