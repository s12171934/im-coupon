import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { couponBenefits, type Citizen, type ConsumptionActionResponse, type ConsumptionSnapshot,
  type Coupon, type IssuedCoupon, type PointEntry } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';
import { DATA_DIR } from '../shared/infrastructure/data-dir.token';
import { readCollection } from '../shared/infrastructure/read-collection';
import { IssuanceError } from '../issuance/domain/services/engine';

const RESERVATION_HOURS = 3;

/** 발급 조건을 복사해 저장하지 않고, 발급 ID에 대한 소비 상태만 기록한다. */
interface CouponUse {
  couponId: string;
  reservedById: string | null;
  reservationExpiresAt: string | null;
  usedAt: string | null;
  ownerReleasedAt: string | null;
}
interface ConsumptionState {
  uses: CouponUse[];
  pointEntries: PointEntry[];
  excludedCouponIds: string[];
}
interface Context {
  state: ConsumptionState;
  coupons: Coupon[];
}

@Injectable()
export class ConsumptionService {
  private readonly db: JsonFileDb;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  snapshot(): Promise<ConsumptionSnapshot> {
    return this.serialize(async () => this.snapshotOf(await this.load()));
  }

  reset(): Promise<ConsumptionActionResponse> {
    return this.serialize(async () => {
      const issued = await readCollection<IssuedCoupon>(this.db, 'issued-coupons');
      const state: ConsumptionState = { uses: [], pointEntries: [], excludedCouponIds: issued.map((coupon) => coupon.id) };
      await this.save(state);
      return { coupons: [], pointEntries: [], paybackAmount: 0, ownerRewardAmount: 0,
        message: '소비 시연을 초기화했습니다. 기존 발급 기록은 보존됩니다.' };
    });
  }

  reserve(couponId: string, consumerId: string): Promise<ConsumptionActionResponse> {
    return this.serialize(async () => {
      const citizen = await this.citizen(consumerId);
      const context = await this.load();
      const coupon = this.coupon(context, couponId);
      if (coupon.status !== 'public') throw new ConflictException('공개된 쿠폰만 점유할 수 있습니다.');
      if (context.coupons.some((item) => item.status === 'reserved' && item.reservedById === consumerId)) {
        throw new ConflictException('한 사람은 공개 쿠폰을 한 장만 점유할 수 있습니다.');
      }
      const use = this.use(context.state, couponId);
      use.reservedById = consumerId;
      use.reservationExpiresAt = new Date(Math.min(
        Date.now() + RESERVATION_HOURS * 3600000, Date.parse(coupon.expiresAt),
      )).toISOString();
      return this.finish(context, `${citizen.name}님이 쿠폰을 점유했습니다. 표시된 점유 기한 안에 사용해 주세요.`);
    });
  }

  simulateOwnerExpiry(couponId: string): Promise<ConsumptionActionResponse> {
    return this.serialize(async () => {
      const context = await this.load();
      if (this.coupon(context, couponId).status !== 'held') {
        throw new ConflictException('소유자 전용 상태의 쿠폰만 시간을 경과시킬 수 있습니다.');
      }
      this.use(context.state, couponId).ownerReleasedAt = new Date().toISOString();
      return this.finish(context, '소유자 전용 기한 경과를 시연했습니다. 쿠폰이 공개됐습니다.');
    });
  }

  consume(couponId: string, consumerId: string): Promise<ConsumptionActionResponse> {
    return this.serialize(async () => {
      const citizen = await this.citizen(consumerId);
      const context = await this.load();
      const coupon = this.coupon(context, couponId);
      const allowed = (coupon.status === 'held' && coupon.ownerId === consumerId)
        || (coupon.status === 'reserved' && coupon.reservedById === consumerId);
      if (!allowed) throw new ConflictException('사용 권한이 없거나 이미 사용·만료된 쿠폰입니다. 공개 쿠폰은 먼저 점유해 주세요.');
      const use = this.use(context.state, couponId);
      use.usedAt = new Date().toISOString();
      use.reservedById = null;
      use.reservationExpiresAt = null;
      const { consumerAmount, ownerAmount } = couponBenefits(coupon, consumerId);
      const entries: PointEntry[] = [{
        id: `${couponId}:consumer-payback`, couponId, recipientId: citizen.id,
        recipientName: citizen.name, amount: consumerAmount, kind: 'consumer-payback', earnedAt: use.usedAt,
      }];
      if (coupon.ownerId !== consumerId && ownerAmount > 0) entries.push({
        id: `${couponId}:owner-reward`, couponId, recipientId: coupon.ownerId,
        recipientName: coupon.ownerName, amount: ownerAmount, kind: 'owner-reward', earnedAt: use.usedAt,
      });
      context.state.pointEntries.unshift(...entries);
      // 사용 기록과 혜택을 같은 파일에 원자적으로 저장해 중복 지급과 부분 지급을 막는다.
      return this.finish(context, `${citizen.name}님의 결제를 시연했습니다. ${consumerAmount.toLocaleString()}원 페이백이 반영됐습니다.`);
    });
  }

  private async citizen(id: string): Promise<Citizen> {
    if (typeof id !== 'string' || !id.trim()) throw new IssuanceError('INVALID_BODY', '소비자 ID가 필요합니다.');
    const citizens = await readCollection<Citizen>(this.db, 'citizens');
    const citizen = citizens.find((item) => item.id === id);
    if (!citizen) throw new NotFoundException('등록된 시민을 찾지 못했습니다.');
    return citizen;
  }

  private coupon(context: Context, id: string): Coupon {
    const coupon = context.coupons.find((item) => item.id === id);
    if (!coupon) throw new NotFoundException('발급된 쿠폰을 찾지 못했습니다.');
    return coupon;
  }

  private use(state: ConsumptionState, couponId: string): CouponUse {
    let use = state.uses.find((item) => item.couponId === couponId);
    if (!use) {
      use = { couponId, reservedById: null, reservationExpiresAt: null, usedAt: null, ownerReleasedAt: null };
      state.uses.push(use);
    }
    return use;
  }

  private async load(): Promise<Context> {
    const issued = await readCollection<IssuedCoupon>(this.db, 'issued-coupons');
    const states = await readCollection<ConsumptionState>(this.db, 'consumption-state');
    const state = states[0] ?? await this.migrate(issued);
    const excluded = new Set(state.excludedCouponIds);
    const uses = new Map(state.uses.map((use) => [use.couponId, use]));
    const now = Date.now();
    const coupons = issued.filter((coupon) => !excluded.has(coupon.id)).map((coupon): Coupon => {
      const use = uses.get(coupon.id);
      const reservationActive = !!use?.reservedById && !!use.reservationExpiresAt
        && Date.parse(use.reservationExpiresAt) > now;
      const status = use?.usedAt ? 'used'
        : Date.parse(coupon.expiresAt) <= now ? 'expired'
        : !use?.ownerReleasedAt && Date.parse(coupon.heldUntil) > now ? 'held'
        : reservationActive ? 'reserved' : 'public';
      return { ...coupon, status,
        reservedById: status === 'reserved' ? use!.reservedById : null,
        reservationExpiresAt: status === 'reserved' ? use!.reservationExpiresAt : null,
        usedAt: use?.usedAt ?? null, ownerReleasedAt: use?.ownerReleasedAt ?? null,
      };
    }).sort((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt));
    return { state, coupons };
  }

  private snapshotOf({ state, coupons }: Context): ConsumptionSnapshot {
    return { coupons, pointEntries: state.pointEntries,
      paybackAmount: state.pointEntries.filter((entry) => entry.kind === 'consumer-payback').reduce((sum, entry) => sum + entry.amount, 0),
      ownerRewardAmount: state.pointEntries.filter((entry) => entry.kind === 'owner-reward').reduce((sum, entry) => sum + entry.amount, 0),
    };
  }

  private async finish(context: Context, message: string): Promise<ConsumptionActionResponse> {
    await this.save(context.state);
    return { ...this.snapshotOf(await this.load()), message };
  }

  private save(state: ConsumptionState): Promise<void> {
    return this.db.writeCollection('consumption-state', [state]);
  }

  /** 기존 시연 파일을 삭제하지 않고 발급 ID가 일치하는 사용 기록만 옮긴다. */
  private async migrate(issued: IssuedCoupon[]): Promise<ConsumptionState> {
    const legacy = await readCollection<{
      id: string; status: string; reservedBy: string | null; reservationExpiresAt: string | null;
      usedAt: string | null; ownerExclusiveUntil: string;
    }>(this.db, 'coupons');
    const points = await readCollection<PointEntry>(this.db, 'points');
    const citizens = await readCollection<Citizen>(this.db, 'citizens');
    const citizenId = (name: string): string | null => {
      const matches = citizens.filter((citizen) => citizen.name === name);
      return matches.length === 1 ? matches[0]!.id : null;
    };
    const byId = new Map(issued.map((coupon) => [coupon.id, coupon]));
    const state: ConsumptionState = {
      excludedCouponIds: await readCollection<string>(this.db, 'consumption-excluded-coupons'),
      uses: legacy.filter((coupon) => byId.has(coupon.id)).map((coupon) => ({
        couponId: coupon.id,
        reservedById: coupon.reservedBy ? citizenId(coupon.reservedBy) : null,
        reservationExpiresAt: coupon.reservationExpiresAt,
        usedAt: coupon.status === 'used' ? coupon.usedAt ?? byId.get(coupon.id)!.issuedAt : null,
        ownerReleasedAt: Date.parse(coupon.ownerExclusiveUntil) < Date.parse(byId.get(coupon.id)!.heldUntil)
          ? coupon.ownerExclusiveUntil : null,
      })),
      pointEntries: points.filter((point) => byId.has(point.couponId)).map((point) => ({ ...point,
        recipientId: point.recipientId ?? (point.kind === 'owner-reward'
          ? byId.get(point.couponId)!.ownerId : citizenId(point.recipientName) ?? `legacy:${point.recipientName}`),
      })),
    };
    // 기존 두 파일 저장이 중간에 실패해도 이미 지급한 혜택을 다시 지급하지 않는다.
    for (const point of state.pointEntries) {
      this.use(state, point.couponId).usedAt ??= point.earnedAt;
    }
    await this.save(state);
    return state;
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const done = this.tail.then(work);
    this.tail = done.then(() => undefined, () => undefined);
    return done;
  }
}
