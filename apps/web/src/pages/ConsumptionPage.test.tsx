import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConsumptionSnapshot, Coupon } from '@im-coupon/contracts';
import { ConsumptionPage } from './ConsumptionPage';

const coupon: Coupon = {
  id: 'cpn-1', status: 'held', trigger: 'manual', ownerId: 'cit-1', ownerName: '김시민',
  merchantId: 'mer-1', merchantName: '달성책방', faceValue: 6000,
  benefitSplit: { ownerRatio: 0.3, consumerRatio: 0.7 },
  issuedAt: '2026-09-10T00:00:00Z', heldUntil: '2026-09-13T00:00:00Z', expiresAt: '2026-09-15T00:00:00Z',
  reservedById: null, reservationExpiresAt: null, usedAt: null, ownerReleasedAt: null,
};
const citizens = [{ id: 'cit-1', name: '김시민' }, { id: 'cit-2', name: '김시민' }];
function snapshot(coupons: Coupon[]): ConsumptionSnapshot {
  return { coupons, pointEntries: [], paybackAmount: 0, ownerRewardAmount: 0 };
}
function json(body: unknown) { return new Response(JSON.stringify(body), { status: 200 }); }
afterEach(() => { vi.unstubAllGlobals(); });

it('기존 발급 API로 발급하고 고정 결제액 없이 발급 액면을 표시한다', async () => {
  let coupons: Coupon[] = [];
  const fetch = vi.fn(async (path: string) => {
    if (path === '/api/citizens') return json({ citizens });
    if (path === '/api/coupons/issue') {
      coupons = [coupon];
      return json({ coupon, decision: { candidateCount: 1, scores: { random: 1, personalFit: 0 }, total: 1 } });
    }
    return json(snapshot(coupons));
  });
  vi.stubGlobal('fetch', fetch);
  render(<ConsumptionPage />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: '쿠폰 소유자' })).toHaveValue('cit-1'));
  fireEvent.click(screen.getByRole('button', { name: '쿠폰 발급' }));
  expect(await screen.findByText(/김시민님에게 달성책방의 6,000원 쿠폰이 발급됐습니다/)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('/api/coupons/issue', expect.objectContaining({ method: 'POST', body: '{}' }));
  expect(screen.getByText('결제 후 6,000원 페이백')).toBeInTheDocument();
  expect(screen.queryByText(/8,000/)).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '쿠폰 소유자' })).toHaveValue('cit-1');
});

it('동명이인 소비자를 ID로 점유시키고 실제 배분 금액을 표시한다', async () => {
  const publicCoupon: Coupon = { ...coupon, status: 'public' };
  const fetch = vi.fn(async (path: string) => {
    if (path === '/api/citizens') return json({ citizens });
    if (path.endsWith('/reserve')) return json({ ...snapshot([{ ...publicCoupon, status: 'reserved', reservedById: 'cit-2' }]), message: '점유 완료' });
    return json(snapshot([publicCoupon]));
  });
  vi.stubGlobal('fetch', fetch);
  render(<ConsumptionPage />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: '쿠폰 소비자' })).toHaveValue('cit-2'));
  expect(screen.getByText('결제 후 4,200원 페이백')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '쿠폰 점유하기' }));
  await screen.findByText('점유 완료');
  expect(fetch).toHaveBeenCalledWith('/api/consumption/coupons/cpn-1/reserve', expect.objectContaining({ body: JSON.stringify({ consumerId: 'cit-2' }) }));
  expect(screen.getByRole('button', { name: '이 쿠폰으로 결제 시연' })).toBeInTheDocument();
});
