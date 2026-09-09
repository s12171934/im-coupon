import { describe, expect, it } from 'vitest';

import { explainPortInUse } from './port-in-use';

function addressInUse(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error('listen EADDRINUSE: address already in use :::3000');
  error.code = 'EADDRINUSE';
  return error;
}

describe('explainPortInUse', () => {
  it('포트 선점 오류에는 포트 번호와 점유 프로세스를 찾는 명령을 알려준다', () => {
    const explanation = explainPortInUse(addressInUse(), 3000);

    expect(explanation).toContain('3000');
    expect(explanation).toContain('lsof -nP -iTCP:3000 -sTCP:LISTEN');
  });

  it('포트 선점 오류에는 삭제된 워크트리의 개발 서버 가능성을 짚어 준다', () => {
    expect(explainPortInUse(addressInUse(), 3000)).toContain('워크트리');
  });

  it('포트 선점이 아닌 오류는 설명하지 않는다', () => {
    const other: NodeJS.ErrnoException = new Error('permission denied');
    other.code = 'EACCES';

    expect(explainPortInUse(other, 3000)).toBeNull();
  });
});
