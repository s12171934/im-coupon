import { useEffect, useRef, useState, type FormEvent } from 'react';
import { STORE_API_PATH, STORE_CODE_CATALOG as codes, type StoreApiResponse, type StoreRegionDivision } from '@im-coupon/contracts';
import './StoreApiPage.css';

export function StoreApiPage() {
  const [divId, setDivId] = useState<StoreRegionDivision>('ctprvnCd');
  const [province, setProvince] = useState('30');
  const [district, setDistrict] = useState('30140');
  const [neighborhood, setNeighborhood] = useState('');
  const [large, setLarge] = useState('');
  const [middle, setMiddle] = useState('');
  const [small, setSmall] = useState('');
  const districts = codes.districts.filter(r => r.provinceCode === province);
  const neighborhoods = codes.neighborhoods.filter(r => r.districtCode === district);
  const region = divId === 'ctprvnCd' ? province : divId === 'signguCd' ? district : neighborhood;
  const middleCategories = codes.middleCategories.filter(r => !large || r.largeCode === large);
  const smallCategories = codes.smallCategories.filter(r => (!large || r.largeCode === large) && (!middle || r.middleCode === middle));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<StoreApiResponse | null>(null);
  const [requestPath, setRequestPath] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
    }
    const path = `${STORE_API_PATH}?${params}`;
    setRequestPath(path); setLoading(true); setError(''); setResult(null);
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(path, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : body?.error?.message ?? `조회에 실패했습니다. HTTP ${response.status}`);
      }
      if (!Array.isArray(body?.items)) throw new Error('조회 응답 형식이 올바르지 않습니다.');
      setResult(body as StoreApiResponse);
    } catch (cause) {
      if (controller.signal.aborted) setError('요청 시간이 초과되었거나 취소되었습니다. 다시 조회해 주세요.');
      else setError(cause instanceof Error ? cause.message : '상가정보를 조회하지 못했습니다.');
    } finally {
      clearTimeout(timer); pending.current = null; setLoading(false);
    }
  }

  return (
    <section className="store-api-page">
      <header>
        <span className="store-api-tag">D1 · 공공데이터 연결</span>
        <h2>상가정보 테스트</h2>
        <p>지역과 업종으로 실제 상가를 조회합니다. 조회 결과는 쿠폰 후보에 자동 저장되지 않습니다.</p>
      </header>
      <form onSubmit={submit}>
        <fieldset disabled={loading}>
          <legend>조회 조건</legend>
          <div className="store-api-fields">
            <label>지역 구분
              <select name="divId" value={divId} onChange={(e) => {
                setDivId(e.target.value as StoreRegionDivision);
              }}>
                {codes.regionDivisions.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </label>
            <input type="hidden" name="key" value={region} />
            <label>시도
              <select value={province} onChange={e => {
                setProvince(e.target.value);
                setDistrict(codes.districts.find(r => r.provinceCode === e.target.value)?.code ?? '');
                setNeighborhood('');
              }} required>
                {codes.provinces.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </label>
            {divId !== 'ctprvnCd' && <label>시군구
              <select value={district} onChange={e => { setDistrict(e.target.value); setNeighborhood(''); }} required>
                <option value="">시군구 선택</option>
                {districts.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </label>}
            {divId === 'adongCd' && <label>행정동
              <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)} required>
                <option value="">행정동 선택</option>
                {neighborhoods.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </label>}
            <label>대분류
              <select name="indsLclsCd" value={large} onChange={e => { setLarge(e.target.value); setMiddle(''); setSmall(''); }}>
                <option value="">전체 대분류</option>
                {codes.largeCategories.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </label>
            <label>중분류
              <select name="indsMclsCd" value={middle} onChange={e => {
                setMiddle(e.target.value); setSmall('');
                const row = codes.middleCategories.find(r => r.code === e.target.value);
                if (row) setLarge(row.largeCode);
              }}>
                <option value="">전체 중분류</option>
                {middleCategories.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </label>
            <label>소분류
              <select name="indsSclsCd" value={small} onChange={e => {
                setSmall(e.target.value);
                const row = codes.smallCategories.find(r => r.code === e.target.value);
                if (row) { setLarge(row.largeCode); setMiddle(row.middleCode); }
              }}>
                <option value="">전체 소분류</option>
                {smallCategories.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </label>
            <label>페이지<input name="pageNo" type="number" min="1" max="9999" defaultValue="1" required /></label>
            <label>조회 건수<input name="numOfRows" type="number" min="1" max="100" defaultValue="20" required /></label>
          </div>
          <p className="store-api-hint">선택한 지역 코드: {region || '지역을 선택해 주세요'}. 업종의 전체 항목을 선택하면 해당 분류는 제한하지 않습니다.</p>
          <p className="store-api-hint">공공 코드 목록: 시도 {codes.provinces.length}개 · 시군구 {codes.districts.length}개 · 행정동 {codes.neighborhoods.length.toLocaleString()}개 / 업종 {codes.largeCategories.length}·{codes.middleCategories.length}·{codes.smallCategories.length.toLocaleString()}개</p>
          <button type="submit">{loading ? '조회 중…' : '상가 조회'}</button>
        </fieldset>
      </form>
      {error && <p className="store-api-error" role="alert">{error}</p>}
      <div aria-live="polite" aria-busy={loading}>
        {loading && <p>공공데이터 API에서 상가정보를 가져오고 있습니다.</p>}
        {result && <>
          <div className="store-api-summary">
            <strong>전체 {result.totalCount.toLocaleString()}개 중 {result.items.length}개 조회</strong>
            <span>기준월 {result.referenceMonth || '미제공'} · {result.pageNo}페이지 · {result.elapsedMs.toLocaleString()}ms</span>
          </div>
          {result.items.length === 0 ? <p>조건에 맞는 상가가 없습니다.</p> :
            <div className="store-api-table"><table>
              <caption>조회된 상가 목록</caption>
              <thead><tr><th>상호</th><th>업종</th><th>지역</th><th>주소</th><th>좌표</th></tr></thead>
              <tbody>{result.items.map((item) => <tr key={item.id}>
                <td>{item.name}{item.branchName && ` ${item.branchName}`}<small>{item.id}</small></td>
                <td>{item.category}<small>{item.categoryCode}</small></td>
                <td>{item.district}<small>{item.neighborhood}</small></td>
                <td>{item.address || '미제공'}</td>
                <td>{item.latitude ?? '—'}, {item.longitude ?? '—'}</td>
              </tr>)}</tbody>
            </table></div>}
          <details><summary>요청 조건과 응답 JSON</summary><code>{requestPath}</code><pre>{JSON.stringify(result, null, 2)}</pre></details>
        </>}
      </div>
    </section>
  );
}
