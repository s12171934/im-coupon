/**
 * 포트 선점으로 기동에 실패했을 때 사람이 읽을 수 있는 안내를 만든다.
 *
 * 기본 스택 트레이스는 "누가 잡고 있는가"를 말해 주지 않는다. 이 저장소에서 그 답은
 * 대개 삭제된 워크트리에 남은 개발 서버이므로, 점유자를 찾는 명령까지 함께 내놓는다.
 * 포트 선점이 아닌 오류는 이 함수가 해석하지 않고 `null` 로 흘려보낸다.
 */
export function explainPortInUse(error: unknown, port: number): string | null {
  if ((error as NodeJS.ErrnoException | null)?.code !== 'EADDRINUSE') return null;

  return [
    `${port} 번 포트가 이미 사용 중이라 API 를 띄우지 못했습니다.`,
    `  누가 잡고 있는지: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
    '  삭제된 워크트리에 남은 개발 서버일 수 있습니다. 그렇다면 해당 PID 를 종료하면 됩니다.',
    `  다른 포트로 띄우려면: PORT=<번호> pnpm dev`,
  ].join('\n');
}
