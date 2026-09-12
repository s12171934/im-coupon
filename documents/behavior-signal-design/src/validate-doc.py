"""Validate documentation and mathematical examples, never application behavior."""
from pathlib import Path
import re,json,math,hashlib,xml.etree.ElementTree as ET
P=Path(__file__).resolve().parent; D=P.parent; doc=(D/'design.md').read_text(); checks=[]
def check(name,condition):
 if not condition:raise AssertionError(name)
 checks.append(name)
heads=list(re.finditer(r'^## (\d+)\. ',doc,re.M));check('14 chapters in order',[int(x[1]) for x in heads]==list(range(1,15)))
sections={int(m[1]):doc[m.end():heads[i+1].start() if i+1<len(heads) else len(doc)] for i,m in enumerate(heads)}
expected={f'B{i:02}' for i in range(1,7)}
sets={9:set(re.findall(r'^\| (B\d+) \|',sections[9],re.M)),10:set(re.findall(r'^### (B\d+) ',sections[10],re.M)),12:set(re.findall(r'^\| TC-\d+-\d+ \| (B\d+) \|',sections[12],re.M)),13:set(re.findall(r'^\| (B\d+) \|',sections[13],re.M))}
check('branch sets 9=10=12=13',all(s==expected for s in sets.values()))
krows=re.findall(r'^\| K\d+ .*?\| (B\d+) \|$',sections[3],re.M);check('3 to 9 summary trace',len(krows)==6 and set(krows)==expected)
cp=re.findall(r'^\| (CP-\d+-\d+) \|',sections[10],re.M);commits=re.findall(r'^\d+\. B\d+ C\d+ — `(CP-\d+-\d+)`',sections[13],re.M)
check('CP to exactly one commit',len(cp)==15 and len(commits)==15 and sorted(cp)==sorted(commits))
tcs=re.findall(r'^\| (TC-(\d+)-(\d+)) \| B(\d+) \|',sections[12],re.M)
for tc,b,n,row_b in tcs:
 check(tc+' branch and completion trace',b==row_b and (tc in sections[10] or any(int(lo)<=int(n)<=int(hi) for lo,hi in re.findall(r'TC-'+b+r'-(\d+)`~`TC-'+b+r'-(\d+)',sections[10]))))
reds=re.findall(r'- RED — `(TC-\d+-01)`',sections[10]);check('six first RED cases',len(reds)==6 and set(reds)<={r[0] for r in tcs})
check('8 to 10 endpoint trace','### `POST /api/recommendations` — B04' in sections[8] and '8장의 유일한 엔드포인트는 `CP-04-03`' in sections[10])
records=json.loads((P/'records.json').read_text());svg=(P/'internals.svg').read_text()
for table,rows in records.items():
 check(table+' 7 to 6 trace',table in sections[7] and table in svg)
 line=next(l for l in sections[7].splitlines() if l.startswith('| `data/runtime/'+table+'.json`'))
 fields=set(re.findall(r'(\w+):',line));check(table+' fields match example',fields==set(rows[0]))
 check(table+' one synthetic example',len(rows)==1 and rows[0]['data_mode']=='synthetic')
for name in ['merchant_embeddings','user_behavior_profiles']:
 v=records[name][0]['vector'];check(name+' vector dimension/norm',len(v)==384 and all(math.isfinite(x) for x in v) and abs(sum(x*x for x in v)-1)<1e-12)
for name in ['api-success.json','api-fallback.json']:
 r=json.loads((P/name).read_text());check(name+' candidates and selected',r['candidateCount']==len(r['rankings']) and r['selectedMerchantId']==r['rankings'][0]['merchant_id'])
 for row in r['rankings']:
  check(name+' contributions',all(math.isclose(row['scores'][k]*r['effectiveWeights'][k],val) for k,val in row['contributions'].items()) and math.isclose(sum(row['contributions'].values()),row['total']))
f=json.loads((P/'api-fallback.json').read_text());check('fallback finite zero',not f['enabled'] and all(r['scores']['personalFit']==0 for r in f['rankings']))
h=lambda obj:hashlib.sha256(json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
for table,digest in records['recommendation_snapshots'][0]['collection_hashes'].items():check(table+' snapshot hash',h(records[table])==digest)
p=[2/math.sqrt(5),1/math.sqrt(5)];scores=[sum(x*y for x,y in zip(p,v)) for v in [[.8,.6],[0,1],[1,0]]]
check('fictional scores',all(abs(a-b)<1e-12 for a,b in zip(scores,[.983869910099908,.447213595499958,.894427190999916])))
check('fictional ranking',sorted(range(3),key=lambda i:-scores[i])==[0,2,1]);check('half life ratio',math.isclose(2**(-1/30)/2**(-31/30),2))
check('merchant weight cap',math.isclose(sum(.9*min(1,2/3.6) for _ in range(4)),2))
links=[]
for f in [D/'design.md',P/'validation.md']:
 for target in re.findall(r'\]\(([^)]+)\)',f.read_text()):
  if target.startswith(('http://','https://','#')):continue
  links.append(target);check('link '+target,(f.parent/target.split('#')[0]).exists())
check('index registration','behavior-signal-design/design.md' in (D.parent/'_index.md').read_text())
for f in [D/'design.md',P/'validation.md',*P.glob('*.svg'),*P.glob('*.json')]:
 text=f.read_text();check(f.name+' portable','/Users/' not in text and '[[' not in text and 'obsidian/' not in text.lower())
for f in P.glob('*.svg'):
 root=ET.parse(f).getroot();ns={'s':'http://www.w3.org/2000/svg'};check(f.name+' SVG title/viewBox',bool(root.find('s:title',ns).text) and bool(root.attrib['viewBox']))
 w,hgt=map(float,root.attrib['viewBox'].split()[2:]);check(f.name+' rectangles inside canvas',all(float(r.get('x',0))+float(r.get('width',0))<=w and float(r.get('y',0))+float(r.get('height',0))<=hgt for r in root.findall('s:rect',ns)))
 # every edge path is followed by a textual label in the generated source
 paths=[e for e in list(root) if e.tag.endswith('path')];check(f.name+' labelled edges',all(list(root)[list(root).index(e)+1].tag.endswith('text') for e in paths))
result={'scope':'documentation only; no app tests or model inference','checks_passed':len(checks),'chapters':14,'branches':6,'components':len(cp),'planned_test_cases':len(tcs),'svg_files':5,'json_examples':4,'local_links':len(links),'checks':checks,'fictional_scores':scores}
(P/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False,indent=2))
