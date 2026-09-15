import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WeightsEditor, type WeightsDraft } from './WeightsEditor';

const EMPTY: WeightsDraft = { salesRecovery: '', personalFit: '' };

/**
 * 제어 컴포넌트라 값을 스스로 들지 않는다. 여러 글자를 이어 치는 케이스를 위해
 * 테스트가 값을 들고, 올라온 `(키, 원문)` 을 그대로 기록한다.
 */
function renderControlled(initial: WeightsDraft = EMPTY, disabled = false) {
  const changes: [string, string][] = [];

  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <WeightsEditor
        value={value}
        disabled={disabled}
        onChange={(key, text) => {
          changes.push([key, text]);
          setValue((current) => ({ ...current, [key]: text }));
        }}
      />
    );
  }

  render(<Harness />);
  return { changes, lastChange: () => changes[changes.length - 1] };
}

describe('WeightsEditor', () => {
  it('신호 라벨과 현재 값을 보여준다', () => {
    renderControlled({ salesRecovery: '1', personalFit: '' });

    expect(screen.getByRole('region', { name: '발급 가중치' })).toBeInTheDocument();
    expect(screen.getByLabelText('상권회복 신호')).toHaveValue('1');
  });

  it('타이핑하면 신호 키와 원문 문자열로 onChange 가 불린다', async () => {
    const { lastChange } = renderControlled();

    await userEvent.type(screen.getByLabelText('상권회복 신호'), '2.5');

    expect(lastChange()).toEqual(['salesRecovery', '2.5']);
    expect(screen.getByLabelText('상권회복 신호')).toHaveValue('2.5');
  });

  it('값을 지우면 빈 문자열이 그대로 올라온다', async () => {
    const { lastChange } = renderControlled({ salesRecovery: '1', personalFit: '' });

    await userEvent.clear(screen.getByLabelText('상권회복 신호'));

    expect(lastChange()).toEqual(['salesRecovery', '']);
  });

  it('숫자가 아닌 글자도 화면이 걸러 내지 않고 원문 그대로 올린다', async () => {
    const { lastChange } = renderControlled();

    await userEvent.type(screen.getByLabelText('상권회복 신호'), 'abc');

    expect(lastChange()).toEqual(['salesRecovery', 'abc']);
    expect(screen.getByLabelText('상권회복 신호')).toHaveValue('abc');
  });

  it('음수도 원문 그대로 올린다', async () => {
    const { lastChange } = renderControlled();

    await userEvent.type(screen.getByLabelText('상권회복 신호'), '-1');

    expect(lastChange()).toEqual(['salesRecovery', '-1']);
  });

  it('아주 큰 수도 원문 그대로 올린다', async () => {
    const { lastChange } = renderControlled();

    await userEvent.type(screen.getByLabelText('상권회복 신호'), '1e999');

    expect(lastChange()).toEqual(['salesRecovery', '1e999']);
  });

  it('disabled 면 입력이 잠겨 값이 바뀌지 않는다', async () => {
    const { changes } = renderControlled({ salesRecovery: '1', personalFit: '' }, true);
    const input = screen.getByLabelText('상권회복 신호');

    expect(input).toBeDisabled();
    await userEvent.type(input, '9');

    expect(changes).toEqual([]);
    expect(input).toHaveValue('1');
  });

  it('가중평균 사용을 안내한다', () => {
    renderControlled();

    expect(
      screen.getByText(/상권회복과 개인화 점수를 가중평균/),
    ).toBeInTheDocument();
  });

  it('신호 입력을 한 자리에서 만들어 라벨과 입력이 짝을 이룬다', () => {
    const onChange = vi.fn();
    render(<WeightsEditor value={EMPTY} onChange={onChange} />);

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(Object.keys(EMPTY).length);
    expect(inputs[0]).toHaveAccessibleName('상권회복 신호');
  });
});

it('개인화 가중치도 편집할 수 있다', async () => {
  const { lastChange } = renderControlled();
  await userEvent.type(screen.getByLabelText('행동 이력 개인화 신호'), '0.7');
  expect(lastChange()).toEqual(['personalFit', '0.7']);
});
