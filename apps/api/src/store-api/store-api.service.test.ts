import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreApiService } from './store-api.service';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('상가정보 시험 조회', () => {
  it('존재하지 않는 코드와 서로 다른 업종 분류 조합을 외부 요청 전에 거부한다', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const service = new StoreApiService();
    await expect(service.search({ key: '99' })).rejects.toMatchObject({ status: 400 });
    await expect(service.search({ indsLclsCd: 'Z9' })).rejects.toMatchObject({ status: 400 });
    await expect(service.search({ indsLclsCd: 'F1', indsSclsCd: 'I20111' })).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('인코딩된 인증키를 한 번만 인코딩해 보내고 응답에는 포함하지 않는다', async () => {
    vi.stubEnv('DATA_GO_KR_SERVICE_KEY', 'sample%2Bkey%3D%3D');
    const fetcher = vi.fn(async (_url: URL) => new Response(JSON.stringify({
      header: { resultCode: '00', stdrYm: '202608' },
      body: { items: [{ bizesId: 'shop-1', bizesNm: '가게', signguNm: '중구' }], totalCount: 1 },
    })));
    vi.stubGlobal('fetch', fetcher);
    const result = await new StoreApiService().search({ divId: 'ctprvnCd', key: '27' });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get('serviceKey')).toBe('sample+key==');
    expect(result.items[0]?.name).toBe('가게');
    expect(JSON.stringify(result)).not.toContain('sample');
  });

  it('배열 쿼리와 잘못된 지역 코드를 외부 요청 전에 거부한다', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new StoreApiService().search({ key: ['27', '11'] })).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('XML 인증 오류에서 원문이나 인증키를 내보내지 않는다', async () => {
    vi.stubEnv('DATA_GO_KR_SERVICE_KEY', 'sample-secret');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<error>sample-secret</error>')));
    await expect(new StoreApiService().search({})).rejects.toMatchObject({
      status: 502, message: '공공데이터 API가 JSON 대신 오류 응답을 반환했습니다. 활용 승인과 인증키를 확인해 주세요.',
    });
  });

  it('인증키가 없으면 외부 요청 없이 설정 오류를 반환한다', async () => {
    vi.stubEnv('DATA_GO_KR_SERVICE_KEY', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new StoreApiService().search({})).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
