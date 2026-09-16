import { HttpException, Injectable } from '@nestjs/common';
import type { StoreApiItem, StoreApiResponse } from '@im-coupon/contracts';
import { STORE_CODE_CATALOG as codes } from '@im-coupon/contracts';

const ENDPOINT = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong';
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

function fail(status: number, message: string): never {
  // 발급용 전역 필터가 BadRequestException을 바꾸므로 일반 HTTP 예외를 사용한다.
  throw new HttpException(message, status);
}

function param(query: JsonObject, name: string, fallback = ''): string {
  const value = query[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') fail(400, `${name}은 하나의 문자열로 입력해 주세요.`);
  return value.trim();
}

function integer(value: string, max: number, name: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    fail(400, `${name}은 1~${max} 사이의 정수여야 합니다.`);
  }
  return Number(value);
}

function coordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class StoreApiService {
  async search(query: JsonObject): Promise<StoreApiResponse> {
    const divId = param(query, 'divId', 'ctprvnCd');
    const key = param(query, 'key', '30');
    const lengths: Record<string, number> = { ctprvnCd: 2, signguCd: 5, adongCd: 8 };
    if (!Object.hasOwn(lengths, divId) || !/^\d+$/.test(key) || key.length !== lengths[divId]) {
      fail(400, '지역 구분에 맞는 코드를 입력해 주세요. 시도 2자리, 시군구 5자리, 행정동 8자리입니다.');
    }
    const regions = divId === 'ctprvnCd' ? codes.provinces : divId === 'signguCd' ? codes.districts : codes.neighborhoods;
    if (!regions.some(r => r.code === key)) fail(400, '공공 코드 목록에 없는 지역입니다. 지역 구분과 코드를 확인해 주세요.');
    const pageNo = integer(param(query, 'pageNo', '1'), 9999, '페이지');
    // 시험 화면은 응답 크기와 호출 비용을 제한한다. 제공 API의 상한은 1,000건이다.
    const numOfRows = integer(param(query, 'numOfRows', '20'), 100, '조회 건수');
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ divId, key, pageNo: String(pageNo), numOfRows: String(numOfRows), type: 'json' }).toString();
    for (const [name, pattern] of [
      ['indsLclsCd', /^[A-Z]\d$/], ['indsMclsCd', /^[A-Z]\d{3}$/], ['indsSclsCd', /^[A-Z]\d{5}$/],
    ] as const) {
      const value = param(query, name);
      if (value && !pattern.test(value)) fail(400, `${name} 업종 코드 형식을 확인해 주세요.`);
      if (value) url.searchParams.set(name, value);
    }
    const large = url.searchParams.get('indsLclsCd');
    const middle = url.searchParams.get('indsMclsCd');
    const small = url.searchParams.get('indsSclsCd');
    const mid = codes.middleCategories.find(r => r.code === middle);
    const leaf = codes.smallCategories.find(r => r.code === small);
    if ((large && !codes.largeCategories.some(r => r.code === large)) || (middle && !mid) || (small && !leaf)) {
      fail(400, '공공 코드 목록에 없는 업종 코드입니다.');
    }
    if ((large && mid && mid.largeCode !== large) || (large && leaf && leaf.largeCode !== large) || (middle && leaf && leaf.middleCode !== middle)) {
      fail(400, '대분류·중분류·소분류의 상하위 관계가 일치하지 않습니다.');
    }
    const configured = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
    if (!configured) fail(503, '서버에 DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.');
    let secret: string;
    try { secret = decodeURIComponent(configured); }
    catch { fail(503, '서버 인증키의 URL 인코딩 형식을 확인해 주세요.'); }
    url.searchParams.set('serviceKey', secret);

    const started = Date.now();
    let response: Response;
    let raw: string;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
      raw = await response.text();
    } catch {
      fail(502, '공공데이터 API에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 요청해 주세요.');
    }
    if (!response.ok) fail(502, `공공데이터 API 요청에 실패했습니다. HTTP ${response.status}`);
    let payload: unknown;
    try { payload = JSON.parse(raw); }
    catch { fail(502, '공공데이터 API가 JSON 대신 오류 응답을 반환했습니다. 활용 승인과 인증키를 확인해 주세요.'); }
    const root = object(payload);
    const envelope = object(root?.response) ?? root;
    const header = object(envelope?.header);
    const code = text(header?.resultCode);
    if (code !== '00') {
      const safeCode = /^[A-Z0-9_]{1,30}$/.test(code) ? code : 'UNKNOWN';
      fail(502, `공공데이터 API 오류 (${safeCode}). 활용 승인, 인증키, 요청 조건을 확인해 주세요.`);
    }
    const body = object(envelope?.body);
    const nestedItems = object(body?.items);
    const sourceItems = nestedItems?.item ?? body?.items;
    const count = Number(body?.totalCount);
    if (!body || !Number.isSafeInteger(count) || count < 0) fail(502, '공공데이터 API 응답 구조를 확인할 수 없습니다.');
    const rows = Array.isArray(sourceItems) ? sourceItems : object(sourceItems) ? [sourceItems] : [];
    if (count > 0 && rows.length === 0) fail(502, '공공데이터 API가 상가 목록을 반환하지 않았습니다. 페이지 번호를 확인해 주세요.');
    // 외부 원문·URL·인증키를 전달하지 않고 화면에 필요한 필드만 반환한다.
    const safeText = (value: unknown): string => text(value).split(secret).join('[REDACTED]').split(configured).join('[REDACTED]');
    const items: StoreApiItem[] = rows.map((row) => {
      const r = object(row);
      if (!r || !text(r.bizesId)) fail(502, '공공데이터 API의 상가 항목 형식이 올바르지 않습니다.');
      return {
        id: safeText(r.bizesId), name: safeText(r.bizesNm), branchName: safeText(r.brchNm),
        district: safeText(r.signguNm), neighborhood: safeText(r.adongNm),
        categoryCode: safeText(r.indsSclsCd), category: safeText(r.indsSclsNm),
        address: safeText(r.rdnmAdr) || safeText(r.lnoAdr),
        longitude: coordinate(r.lon), latitude: coordinate(r.lat),
      };
    });
    return {
      source: '소상공인시장진흥공단 상가(상권)정보', referenceMonth: safeText(header?.stdrYm),
      totalCount: count, pageNo, numOfRows, elapsedMs: Date.now() - started, items,
    };
  }
}
