import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Citizen } from '@im-coupon/contracts';

import { OwnerSelect } from './owner-select';

/**
 * 이름과 `id` 를 둘 다 역순으로 둔 픽스처다. 컴포넌트가 이름으로든 `id` 로든
 * 다시 정렬하면 순서가 뒤집혀 드러난다 — 시민 목록은 "시드에 든 순서 그대로"가
 * 계약이므로(설계문서 8장) 화면이 그 순서를 건드리지 않는 것을 이 픽스처가 잡는다.
 */
const CITIZENS: Citizen[] = [
  { id: 'cit-003', name: '최하늘' },
  { id: 'cit-002', name: '박두리' },
  { id: 'cit-001', name: '김가람' },
];

function renderSelect(props: Partial<Parameters<typeof OwnerSelect>[0]> = {}) {
  const onChange = vi.fn();
  render(<OwnerSelect citizens={CITIZENS} value={null} onChange={onChange} {...props} />);
  return { onChange, select: screen.getByLabelText('소유자 선택') };
}

/** 플레이스홀더를 뺀 선택지의 라벨·값을 화면에 그려진 순서대로 읽는다 */
function citizenOptions() {
  return screen
    .getAllByRole('option')
    .slice(1)
    .map((option) => [option.textContent, (option as HTMLOptionElement).value]);
}

describe('OwnerSelect', () => {
  it('라벨이 셀렉트에 붙고 시민 이름이 선택지로 그려진다', () => {
    const { select } = renderSelect();

    expect(select.tagName).toBe('SELECT');
    expect(citizenOptions()).toEqual([
      ['최하늘', 'cit-003'],
      ['박두리', 'cit-002'],
      ['김가람', 'cit-001'],
    ]);
  });

  it('시민 목록을 다시 정렬하지 않고 받은 순서 그대로 그린다', () => {
    renderSelect();

    expect(citizenOptions().map(([name]) => name)).toEqual(['최하늘', '박두리', '김가람']);
  });

  it('아직 아무도 선택하지 않았으면 어떤 시민도 선택되어 보이지 않는다', () => {
    const { select } = renderSelect({ value: null });

    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: '시민을 선택하세요' })).toBeInTheDocument();
  });

  it('시민을 고르면 그 시민의 id 로 콜백이 한 번 불린다', async () => {
    const { onChange, select } = renderSelect({ value: null });

    await userEvent.selectOptions(select, 'cit-002');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('cit-002');
  });

  it('선택된 id 를 값으로 반영한다', () => {
    const { select } = renderSelect({ value: 'cit-002' });

    expect(select).toHaveValue('cit-002');
  });

  it('선택된 id 가 목록에 없으면 아무 시민도 선택된 것처럼 보이지 않는다', () => {
    const { select } = renderSelect({ value: 'cit-999' });

    /*
      목록이 갱신되며 선택된 시민이 사라진 상태다. 어느 선택지와도 짝이 맞지 않으므로
      셀렉트는 선택 전과 같은 플레이스홀더를 보여주고, 어떤 시민도 선택되지 않는다.
    */
    expect(select).toHaveValue('');
    expect(
      screen
        .getAllByRole('option')
        .filter((option) => (option as HTMLOptionElement).selected)
        .map((option) => option.textContent),
    ).toEqual(['시민을 선택하세요']);
  });

  it('선택을 플레이스홀더로 되돌려도 빈 값을 올리지 않고 표시가 앞 선택에 머문다', async () => {
    const { onChange, select } = renderSelect({ value: 'cit-002' });

    await userEvent.selectOptions(select, '');

    expect(onChange).not.toHaveBeenCalled();
    /*
      콜백을 막는 것만으로는 부족하다 — 상위 상태가 바뀌지 않아 리렌더가 없으면 컨트롤만
      플레이스홀더로 내려가 표시와 조립 층이 든 소유자가 갈릴 수 있다. 제어 컴포넌트라
      React 가 이벤트 뒤 DOM 값을 `value` prop 으로 되돌리므로 그 갈림이 생기지 않는다는
      것을 값과 선택된 선택지 양쪽으로 단언한다.
    */
    expect(select).toHaveValue('cit-002');
    expect(
      screen
        .getAllByRole('option')
        .filter((option) => (option as HTMLOptionElement).selected)
        .map((option) => option.textContent),
    ).toEqual(['박두리']);
  });

  it('시민이 0건이면 고를 시민이 없음을 알리고 선택지를 두지 않는다', () => {
    renderSelect({ citizens: [] });

    expect(screen.getByRole('option', { name: '고를 수 있는 시민이 없습니다' })).toBeInTheDocument();
    expect(citizenOptions()).toEqual([]);
  });

  it('시민이 0건이어도 컨트롤을 잠그지 않는다', () => {
    const { select } = renderSelect({ citizens: [] });

    expect(select).toBeEnabled();
  });

  it('disabled 면 셀렉트가 잠기고 변경 콜백이 불리지 않는다', async () => {
    const { onChange, select } = renderSelect({ value: 'cit-001', disabled: true });

    expect(select).toBeDisabled();
    await userEvent.click(select);

    expect(onChange).not.toHaveBeenCalled();
    expect(select).toHaveValue('cit-001');
  });
});
