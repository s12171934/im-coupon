import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StorageStatus, type StorageStatusState } from './storage-status';

function renderStatus(state: StorageStatusState) {
  return render(<StorageStatus state={state} />);
}

describe('StorageStatus', () => {
  it('확인 중에는 안내만 보이고 상태·상세는 아직 없다', () => {
    renderStatus({ kind: 'loading' });

    expect(screen.getByRole('region', { name: '저장소 상태' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '저장소' })).toBeInTheDocument();
    expect(screen.getByText('확인 중…')).toBeInTheDocument();
    expect(screen.queryByTestId('storage-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-detail')).not.toBeInTheDocument();
  });

  it('조회가 실패하면 연결 실패 안내를 보여준다', () => {
    renderStatus({ kind: 'failed' });

    expect(screen.getByText('API 에 연결하지 못했습니다')).toBeInTheDocument();
    expect(screen.queryByText('확인 중…')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-detail')).not.toBeInTheDocument();
  });

  it('저장소가 정상이면 스키마 판과 컬렉션 수를 보여준다', () => {
    renderStatus({
      kind: 'loaded',
      health: {
        status: 'ok',
        storage: { readable: true, schemaVersion: 2, collections: ['merchants', 'citizens', 'coupons'] },
      },
    });

    expect(screen.getByTestId('storage-status')).toHaveTextContent('정상');
    expect(screen.getByTestId('storage-detail')).toHaveTextContent('스키마 2판 · 컬렉션 3개');
    expect(screen.queryByText('확인 중…')).not.toBeInTheDocument();
    expect(screen.queryByText('API 에 연결하지 못했습니다')).not.toBeInTheDocument();
  });

  it('상태가 degraded 면 점검 필요로 보여준다', () => {
    renderStatus({
      kind: 'loaded',
      health: {
        status: 'degraded',
        storage: { readable: true, schemaVersion: 2, collections: ['coupons'] },
      },
    });

    expect(screen.getByTestId('storage-status')).toHaveTextContent('점검 필요');
    expect(screen.getByTestId('storage-detail')).toHaveTextContent('스키마 2판 · 컬렉션 1개');
  });

  it('저장소를 읽지 못하면 상세를 읽기 실패 안내로 바꾼다', () => {
    renderStatus({
      kind: 'loaded',
      health: {
        status: 'degraded',
        storage: { readable: false, schemaVersion: null, collections: [] },
      },
    });

    expect(screen.getByTestId('storage-status')).toHaveTextContent('점검 필요');
    expect(screen.getByTestId('storage-detail')).toHaveTextContent('데이터 디렉터리를 읽지 못했습니다');
  });

  it('읽었지만 스키마 판을 모르면 판 자리를 물음표로 둔다', () => {
    renderStatus({
      kind: 'loaded',
      health: {
        status: 'ok',
        storage: { readable: true, schemaVersion: null, collections: [] },
      },
    });

    expect(screen.getByTestId('storage-detail')).toHaveTextContent('스키마 ?판 · 컬렉션 0개');
  });
});
