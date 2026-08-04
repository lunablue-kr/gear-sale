#!/bin/bash
# 배포 전/후 상태 점검 — 상태 소스가 서로 어긋나지 않는지 확인한다.
#   사용법:  ./check.sh
# 오늘(8/1) 한쪽을 고치다 다른 쪽을 깨뜨린 일이 있어 만들어 둠.

cd "$(dirname "$0")" || exit 1
EP="https://script.google.com/macros/s/AKfycbx4wOLUzlKJYdBJEGH2J8I2NEQAz77lShix8bxDaNELDKEXHcs_XZ7-bZilpfBdANU_yA/exec"

echo "── 1. 파일 문법"
osascript -l JavaScript -e '
ObjC.import("Foundation");
function rd(p){return $.NSString.stringWithContentsOfFileEncodingError(p,4,null).js;}
var out=[], bad=0;
// 인라인 스크립트
["index.html","panel-7f3ac91d5b.html"].forEach(function(f){
  var s=rd(f),re=/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g,m,b="";
  while((m=re.exec(s))!==null){try{new Function(m[1]);}catch(e){b=e.message;}}
  if(b){bad++;out.push("   ✗ "+f+" "+b.slice(0,60));} else out.push("   ✓ "+f);
});
// 외부 JS (분리 후 여기가 본체다)
["assets/js/panel-data.js","assets/js/panel-sheet.js","assets/js/panel-cols.js","assets/js/panel-view.js","assets/js/panel-bulk.js","assets/js/panel-stats.js","assets/js/panel-app.js",
 "data/items.js","data/items-head.js","data/status-snapshot.js"].forEach(function(f){
  var src=rd(f);
  if(!src){ out.push("   ✗ "+f+" 없음"); bad++; return; }
  try { new Function(src); out.push("   ✓ "+f.replace("assets/","")); }
  catch(e){ bad++; out.push("   ✗ "+f+" "+String(e.message).slice(0,60)); }
});
// 모듈을 로드 순서대로 이어붙여도 성립하는지 (선언 충돌·순서 문제)
try {
  var all=["panel-data","panel-sheet","panel-cols","panel-view","panel-bulk","panel-stats","panel-app"].map(function(n){return rd("assets/js/"+n+".js");}).join("\n");
  new Function(all); out.push("   ✓ 7개 모듈 결합");
} catch(e){ bad++; out.push("   ✗ 모듈 결합 "+String(e.message).slice(0,60)); }
out.join("\n");'

echo "── 2. 품목 데이터"
python3 - <<'PY'
import re, glob, os, collections
items, imgs = [], []
for f in glob.glob("data/items/*.js"):
    src = open(f, encoding="utf-8").read()
    for m in re.finditer(r'sku:"([^"]+)",\s*name:"((?:[^"\\]|\\.)*)"(.*?)\}', src, re.S):
        st = re.search(r'status:"(\w+)"', m.group(3))
        items.append((m.group(1), m.group(2).replace('\\"', '"'), st.group(1) if st else "?"))
        for p in re.findall(r'"(assets/[^"]+)"', m.group(3)):
            imgs.append((m.group(1), p))
sku = [i[0] for i in items]
dup_sku = [k for k, v in collections.Counter(sku).items() if v > 1]
bad_st = [i for i in items if i[2] not in ("sale", "hold", "sold")]
miss = [(s, p) for s, p in imgs if not os.path.exists(p)]
used = {p for _, p in imgs}
orphan = [x for x in os.listdir("assets") if not x.startswith(".") and "assets/" + x not in used]
# 한 사진을 여러 품목이 함께 쓰면 덮어쓰기 사고가 난다 (8/1 그립23 사례)
shared = [p for p, c in collections.Counter(p for _, p in imgs).items() if c > 1]
print(f"   품목 {len(items)} · 사진참조 {len(imgs)}")
print(f"   {'✓' if not dup_sku else '✗'} sku 중복 {len(dup_sku)} {dup_sku[:3]}")
print(f"   {'✓' if not bad_st else '✗'} 잘못된 status {len(bad_st)}")
print(f"   {'✓' if not miss else '✗'} 없는 사진 {len(miss)} {miss[:2]}")
print(f"   {'✓' if not shared else '⚠'} 여러 품목이 공유하는 사진 {len(shared)} {shared[:3]}")
print(f"   · 안 쓰는 사진 {len(orphan)}")
PY

echo "── 3. 서버 연동"
python3 - "$EP" <<'PY'
import sys, json, urllib.request, re, glob
EP = sys.argv[1]
try:
    res = set(json.load(urllib.request.urlopen(EP))["reserved"])
    st = json.load(urllib.request.urlopen(EP + "?action=status"))
except Exception as e:
    print("   ✗ 서버 조회 실패:", e); raise SystemExit
sold, sale = set(st["sold"]), set(st["sale"])
print(f"   ✓ 입찰중 {len(res)} · 판매완료 {len(sold)} · 판매중지정 {len(sale)} · 남은수량 {len(st.get('remain',{}))}")
names = {}
for f in glob.glob("data/items/*.js"):
    for m in re.finditer(r'sku:"([^"]+)",\s*name:"((?:[^"\\]|\\.)*)"', open(f, encoding="utf-8").read()):
        names[m.group(2).replace('\\"', '"')] = m.group(1)
both = sold & sale
ghost = [n for n in (sold | sale) if n not in names]     # 시트에만 있고 품목엔 없는 이름
print(f"   {'✓' if not both else '✗'} sold·sale 동시 지정 {len(both)} {list(both)[:2]}")
print(f"   {'✓' if not ghost else '⚠'} 품목에 없는 이름이 시트에 {len(ghost)} {ghost[:3]}")
PY

echo "── 4. 상태 스냅샷 신선도"
python3 - <<'PY'
import json, re, datetime, os
p = "data/status-snapshot.js"
if not os.path.exists(p): print("   ✗ 스냅샷 없음 — ./snapshot.sh 실행"); raise SystemExit
m = re.search(r'= (\{.*\});', open(p, encoding="utf-8").read(), re.S)
d = json.loads(m.group(1))
age = (datetime.datetime.now() - datetime.datetime.fromisoformat(d["t"])).total_seconds() / 3600
mark = "✓" if age < 24 else "⚠"
print(f"   {mark} {d['t']} ({age:.1f}시간 전) · 예약 {len(d['reserved'])} · 판매완료 {len(d['sold'])}")
if age >= 24: print("     오래됨 — 배포 전 ./snapshot.sh 실행 권장")
PY

echo "── 5. 개인정보 유출 경로"
git ls-files | grep -E 'bids-local|apps-script-admin' && echo "   ✗ 개인정보 파일이 추적되고 있음" || echo "   ✓ 개인정보 파일 미추적"
