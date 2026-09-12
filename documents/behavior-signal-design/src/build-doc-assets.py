"""Document assets only. Run from any cwd; writes beside this file."""
from pathlib import Path
import json, hashlib, html
P=Path(__file__).resolve().parent
T='2026-09-13T00:00:00.000Z'; U='2026-09-12T00:00:00.000Z'
hash_=lambda s:hashlib.sha256(s.encode()).hexdigest()
v=[1.0]+[0.0]*383
mode={'data_mode':'synthetic'}
manifest={'manifest_id':'fixture-only','model_id':'fixture-only','model_revision':'fixture-only','tokenizer_revision':'fixture-only','runtime_versions':{'fixture':'1'},'preprocess_version':'merchant-text.v1','dimension':384,'artifact_hash':hash_('fixture-only'),**mode}
params={'lookback_days':90,'half_life_days':30,'merchant_weight_cap':2,'day_zone':'Asia/Seoul','model_id':'fixture-only','dimension':384,'model_revision':'fixture-only','preprocess_version':'merchant-text.v1','profile_version':'personalFit.behavior.v1','text_prefix':'query: ','max_menus':5,'max_tokens':512,'norm_epsilon':1e-12,'unit_tolerance':1e-5,'weights':{'personalFit':.95,'random':.05},'fallback_random_weight':1,'max_candidates':200,'demo_users':4,'demo_merchants':12}
ranking={'merchant_id':'mer-demo-a','rank':1,'scores':{'personalFit':1,'random':.5},'contributions':{'personalFit':.95,'random':.025},'total':.975,'reason_codes':['SHARED_CATEGORY','SINGLE_HISTORY']}
records={
'coupon_use_events':[{'event_id':'evt-1','coupon_ids':['cpn-demo-1'],'transaction_id':'tx-1','actual_user_id':'cit-demo-1','merchant_id':'mer-demo-a','used_at':U,'recorded_at':U,'status_revision':1,'ingest_seq':1,'finality_state':'confirmed','net_use_amount_won':5000,'merchant_content_version':'content-1',**mode}],
'merchant_content_versions':[{'merchant_id':'mer-demo-a','content_version':'content-1','category_code':'demo-snack','category_label':'분식','representative_menus':['김밥'],'source_ids':['demo'],'known_at':'2026-09-01T00:00:00.000Z','verified_at':'2026-09-01T00:00:00.000Z','text_hash':hash_('query: 업종: 분식. 대표메뉴: 김밥.'),**mode}],
'merchant_source_links':[{'merchant_id':'mer-demo-a','source_id':'demo','external_shop_id':'demo-shop-1','verified_at':'2026-09-01T00:00:00.000Z',**mode}],
'embedding_manifests':[manifest],
'merchant_embeddings':[{'merchant_id':'mer-demo-a','content_version':'content-1','manifest_id':'fixture-only','vector':v,'computed_at':U,**mode}],
'user_behavior_profiles':[{'profile_id':'profile-1','user_id':'cit-demo-1','as_of':T,'event_watermark':1,'history_digest':hash_('fixture-history'),'manifest_id':'fixture-only','profile_version':'personalFit.behavior.v1','vector':v,'distinct_merchants':1,'distinct_use_days':1,'weight_sum':2**(-1/30),**mode}],
'recommendation_snapshots':[{'snapshot_id':'snapshot-1','as_of':T,'event_watermark':1,'collection_hashes':{},'candidate_content_versions':{'mer-demo-a':'content-1'},'manifest_id':'fixture-only','params':params,**mode}],
'recommendation_decisions':[{'recommendation_id':'rec-1','user_id':'cit-demo-1','as_of':T,'candidate_ids':['mer-demo-a'],'candidate_set_version':hash_('["mer-demo-a"]'),'snapshot_id':'snapshot-1','profile_id':'profile-1','profile_version':'personalFit.behavior.v1','manifest_id':'fixture-only','requested_weights':{'personalFit':.95,'random':.05},'effective_weights':{'personalFit':.95,'random':.05},'enabled':True,'disabled_reasons':[],'rankings':[ranking],'selected_merchant_id':'mer-demo-a','random_seed':1,'random_algorithm':'fixture-sequence-v1',**mode}]}
for k in list(records)[:6]:
 records['recommendation_snapshots'][0]['collection_hashes'][k]=hash_(json.dumps(records[k],ensure_ascii=False,sort_keys=True,separators=(',',':')))
records['user_behavior_profiles'][0]['history_digest']=hash_(json.dumps(records['coupon_use_events'],ensure_ascii=False,sort_keys=True,separators=(',',':')))
records['recommendation_snapshots'][0]['collection_hashes']['user_behavior_profiles']=hash_(json.dumps(records['user_behavior_profiles'],ensure_ascii=False,sort_keys=True,separators=(',',':')))
write=lambda n,o:(P/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
write('records.json',records)
response={'recommendationId':'rec-1','citizenId':'cit-demo-1','asOf':T,'dataMode':'synthetic','candidateCount':1,'selectedMerchantId':'mer-demo-a','enabled':True,'disabledReasons':[],'requestedWeights':{'personalFit':.95,'random':.05},'effectiveWeights':{'personalFit':.95,'random':.05},'rankings':[ranking],'snapshotId':'snapshot-1','profileVersion':'personalFit.behavior.v1','modelRevision':'fixture-only'}
write('api-success.json',response)
fallback={**response,'recommendationId':'rec-2','enabled':False,'disabledReasons':['NO_HISTORY'],'requestedWeights':{'personalFit':1,'random':0},'effectiveWeights':{'personalFit':0,'random':1},'rankings':[{**ranking,'scores':{'personalFit':0,'random':.5},'contributions':{'personalFit':0,'random':.5},'total':.5,'reason_codes':[]}],'snapshotId':'snapshot-2','modelRevision':None}
write('api-fallback.json',fallback)
write('api-error.json',{'error':{'code':'UNKNOWN_CITIZEN','message':'확인할 수 없는 시민입니다.'}})
# Simple SVG layouts: explicit labelled edges, no external assets.
def svg(name,title,w,h,boxes,edges,lanes=()):
 a=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{min(w,740)}" height="{round(h*min(w,740)/w)}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title"><title id="title">{html.escape(title)}</title>', '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="#52647a"/></marker></defs>',f'<rect width="{w}" height="{h}" fill="#f8fafc"/>',f'<text x="28" y="36" font-family="sans-serif" font-size="22" fill="#142b45">{html.escape(title)}</text>']
 for x,y,bw,bh,label in lanes:
  a.append(f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="8" fill="#e8eef6"/><text x="{x+12}" y="{y+24}" font-family="sans-serif" font-size="15">{html.escape(label)}</text>')
 for x,y,bw,bh,lines,dashed in boxes:
  a.append(f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="8" fill="white" stroke="#41698b" stroke-width="2"'+(' stroke-dasharray="7 5"' if dashed else '')+'/>')
  for i,line in enumerate(lines):a.append(f'<text x="{x+12}" y="{y+25+i*23}" font-family="sans-serif" font-size="15" fill="#142b45">{html.escape(line)}</text>')
 for path,lx,ly,label,dashed in edges:
  a.append(f'<path d="{path}" fill="none" stroke="#52647a" stroke-width="2" marker-end="url(#arrow)"'+(' stroke-dasharray="7 5"' if dashed else '')+'/>' )
  a.append(f'<text x="{lx}" y="{ly}" font-family="sans-serif" font-size="13" fill="#142b45" stroke="#f8fafc" stroke-width="4" paint-order="stroke">{html.escape(label)}</text>')
 a.append('</svg>');(P/name).write_text('\n'.join(a))
rows=[('apps/web','발급·소비 화면','추천 화면·훅·UI 추가'),('apps/api','발급·소비·random','추천·S6·준비 계층 추가'),('packages/contracts','발급·소비 계약','추천 계약 추가'),('packages/db','JSON 파일 읽기·쓰기','S6 직렬화·캡처 추가'),('e2e','기존 브라우저 시나리오','추천 재현 시나리오 추가')]
boxes=[];edges=[]
for i,(ws,before,after) in enumerate(rows):
 y=90+i*105;boxes.extend([(35,y,335,78,[ws,before],False),(560,y,350,78,[ws,after],False)]);edges.append((f'M370 {y+39} H550',405,y+29,'후속 변경',False))
svg('project.svg','변경 전 → 후속 S6 설계',950,650,boxes,edges)
collections=list(records)
boxes=[(25,80,370,115,['apps/api','presentation → application → domain','ports ← infrastructure'],False),(450,80,510,275,['packages/db · S6 직렬화 / 원자 저장']+collections+['읽기 전용: citizens / merchants / _meta'],False),(25,235,370,100,['apps/web','RecommendationPage → use-recommendations','→ RecommendationPanel'],False),(25,385,370,95,['packages/contracts','RecommendationRequest / Response','RecommendationWeights'],False),(450,410,510,70,['e2e','HTTP·화면·격리 시드로 재현'],False)]
svg('internals.svg','다섯 워크스페이스와 JSON 컬렉션',1000,535,boxes,[('M395 135 H440',403,120,'저장 포트',False),('M210 235 V205',230,223,'HTTP',False),('M210 335 V375',228,360,'계약',False),('M650 410 V365',663,388,'시드',False)])
svg('extensions.svg','동기 신호 확장점 · 점선은 범위 제외',1100,510,[(30,85,300,95,['준비 결과','스냅숏 → 행동 프로필','점수 맵 / 비활성 이유'],False),(445,80,280,70,['S6','동기 score → 숫자'],False),(445,225,280,70,['대체 신호','동기 score → 유한한 0'],False),(830,140,240,75,['가중합 엔진','최고 하나 / 동점 첫 후보'],False),(30,385,300,70,['실로그 어댑터','실제 사용자 검증 필요'],True),(445,385,280,70,['S1·S2·S3·S4·S5','별도 후속 구현'],True),(830,385,240,70,['발급 연결','별도 후속 구현'],True)],[('M330 110 H435',348,100,'준비 성공',False),('M330 155 H375 V260 H435',343,245,'준비 실패',False),('M725 115 H775 V160 H820',747,102,'점수',False),('M725 260 H775 V195 H820',750,283,'0 점수',False),('M180 385 V190',193,337,'사용 사건',True),('M725 420 H790 V210 H820',742,365,'후속 점수',True),('M950 215 V375',965,307,'선택 사용처',True)])
lanes=[];boxes=[];edges=[]
ws=['contracts','db','api','web','e2e']; assignment=[['contracts','db','api'],['api'],['api'],['api'],['web'],['api','e2e']]
for i,label in enumerate(ws):lanes.append((25+i*215,70,200,695,label))
for b,items in enumerate(assignment):
 y=120+b*105
 for item in items: boxes.append((35+ws.index(item)*215,y,180,62,[f'B{b+1:02}',rows[ws.index(item)][0] if False else ['계약·저장','가게 벡터','행동 프로필','추천 API','모의 시연','평가·E2E'][b]],False))
# dependency spine in api lane, transfer to web then back; explicitly labelled.
for b in range(5):
 sx=555 if b!=4 else 770;sy=182+b*105;tx=770 if b==3 else 555;ty=120+(b+1)*105
 edges.append((f'M{sx} {sy} V{sy+18} H{tx} V{ty-5}',min(sx,tx)+8,sy+34,['계약·저장','가게 벡터','준비 결과','추천 API','시연 경로'][b],False))
svg('branches.svg','단일 계획 스택 · EPIC 미확정',1120,800,boxes,edges,lanes)
svg('flows.svg','정상 · S6 비활성 · 요청 실패',1150,670,[(35,85,290,75,['고정 시민 · 후보 집합','입력 검증'],False),(430,85,290,75,['스냅숏','사용 사건 · 내용 버전 · 가게 벡터'],False),(430,255,290,75,['행동 프로필 → 준비 결과','유효성 검사'],False),(35,430,290,75,['대체 신호','후보 집합 유지'],False),(825,255,290,75,['가중합 엔진','한 번 채점'],False),(825,430,290,75,['추천 기록','저장 성공 뒤 응답'],False),(430,560,290,70,['모의 시연','개인화 적용 여부 표시'],False),(35,255,290,75,['요청 오류','400 / 404 / 422 / 503'],False),(825,560,290,70,['요청 오류','저장 실패 503'],False)],[('M325 122 H420',346,111,'형식 정상',False),('M180 160 V245',191,208,'입력·원본 오류',False),('M575 160 V245',588,211,'입력 고정',False),('M720 292 H815',744,280,'준비 성공',False),('M430 305 H375 V467 H335',346,393,'준비 실패',False),('M325 475 H760 V315 H815',500,465,'0 점수 + 대체 가중치',False),('M970 330 V420',982,386,'선택',False),('M825 490 H775 V595 H730',744,538,'저장 성공',False),('M970 505 V550',980,535,'저장 실패',False)])
print('Generated 5 SVG and 4 JSON document assets')
