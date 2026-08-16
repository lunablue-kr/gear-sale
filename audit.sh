#!/bin/bash
# 어드민·시트·구매페이지 3자 교차 검증
#   ./audit.sh                 서버 공개 데이터로 검증 (비밀번호 불필요)
#   ./audit.sh done.txt        어드민 '완료' 목록까지 대조 (관리메모 F열 QUERY 결과를 붙여넣은 파일)
# check.sh 가 "파일이 성립하는가"를 본다면, 이건 "데이터가 앞뒤가 맞는가"를 본다.
cd "$(dirname "$0")"
EP="https://script.google.com/macros/s/AKfycbx4wOLUzlKJYdBJEGH2J8I2NEQAz77lShix8bxDaNELDKEXHcs_XZ7-bZilpfBdANU_yA/exec"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "── 서버 조회"
curl -sL --max-time 45 "$EP?action=status" -o "$TMP/status.json" || { echo "   ✗ 판매상태 조회 실패"; exit 1; }
curl -sL --max-time 45 "$EP" -o "$TMP/reserved.json" || { echo "   ✗ 예약 조회 실패"; exit 1; }
python3 - "$TMP" "${1:-}" <<'PY'
import json, re, sys, os
tmp, donefile = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "")
s = json.load(open(f"{tmp}/status.json")); r = json.load(open(f"{tmp}/reserved.json"))

items = {}
for c in ['camera','strobe','mod','grip','pc','bg','fabric','propA','propB','office','etc']:
    t = open(f'data/items/{c}.js', encoding='utf8').read()
    for m in re.finditer(r'\{[^{}]*sku:"([^"]+)"[^{}]*\}', t):
        blk = m.group(0)
        name = re.search(r'name:"((?:[^"\\]|\\.)*)"', blk)
        qty  = re.search(r'qty:(\d+)', blk)
        items[m.group(1)] = {
            'name': (name.group(1) if name else '').replace('\\"', '"'),
            'qty': int(qty.group(1)) if qty else 1,
            'gone': 'gone:true' in blk,
            'status': (re.search(r'status:"(\w+)"', blk) or [None, ''])[1],
        }

skuSold, skuSale = set(s['skuSold']), set(s['skuSale'])
nameSold, nameSale = set(s['nameSold'] or s['sold']), set(s['nameSale'] or s['sale'])
remain = s['remain']; bidSku = set(r['reservedSku'])
bad = warn = 0

def err(m):
    global bad; bad += 1; print("   ✗ " + m)
def wrn(m):
    global warn; warn += 1; print("   ! " + m)

print("── 1. 판매상태 정합성")
for k, it in items.items():
    sold = k in skuSold or it['name'] in nameSold
    rm = remain.get(k)
    if sold and rm not in (None, 0):
        err(f"{k} {it['name'][:32]} — 판매완료인데 남은수량 {rm} (둘 중 하나가 틀림)")
    if k in skuSold and k in skuSale:
        err(f"{k} — sold·sale 동시 지정")
    if rm is not None and rm > it['qty']:
        err(f"{k} {it['name'][:32]} — 남은수량 {rm} > 총수량 {it['qty']}")
    if rm is not None and it['qty'] == 1 and rm not in (0, 1):
        wrn(f"{k} {it['name'][:32]} — 단품인데 남은수량 {rm}")
    if it['gone'] and (sold or k in bidSku):
        wrn(f"{k} {it['name'][:32]} — 내린 품목인데 서버에 상태/예약이 남음 (표시엔 영향 없음)")
if not bad: print("   ✓ 이상 없음")

print("── 2. 수량 여러 개인데 전량 판매완료 (부분판매 누락 의심)")
# 증거 기반 판정: v41(08-08)부터 전량 판매 처리는 남은수량 0을 함께 기록하므로
# remain==0 이 있으면 시스템이 스스로 검증한 것 — 사람에게 묻지 않는다.
# 아래 목록은 그 이전(증거 없던 시절)의 기록 중 이미 확인이 끝난 것. 더 늘어나면 안 된다.
LEGACY_CONFIRMED = {
    'etc-1','grip-1','grip-10','grip-12','grip-13','grip-16','grip-2','grip-3','grip-9',
    'mod-14','mod-15','mod-19','mod-20','mod-21',
    'strobe-1',   # D2 1000 ×3 — 08-08 판매자 직접 처리분
}
n = 0
for k, it in items.items():
    if it['qty'] <= 1: continue
    sold_flag = k in skuSold or it['name'] in nameSold
    if not sold_flag: continue
    if remain.get(k) == 0: continue          # 증거 있음 — 검증된 전량 판매
    if k in LEGACY_CONFIRMED: continue       # 증거 없던 시절, 확인 완료
    print(f"   ! {k} {it['name'][:40]} (총 {it['qty']}개) — 남은수량 기록 없이 전량 판매완료"); n += 1; warn += 1
if not n: print("   ✓ 없음 — 새 전량 판매는 남은수량 0 기록으로 자동 검증됨")

print("── 3. 예약(입찰) 목록과 품목 대조")
skus = set(items)
orphan = [k for k in bidSku if k not in skus]
if orphan: err(f"품목에 없는 sku가 예약 목록에: {orphan}")
else: print("   ✓ 모든 예약 sku가 현재 품목과 매칭")

if donefile and os.path.exists(donefile):
    print("── 4. 어드민 '완료' vs 구매페이지 반영")
    n = 0
    for line in open(donefile, encoding='utf8'):
        line = line.strip()
        if not line or '|' not in line: continue
        sku, who = line.split('|')[0], line.split('|')[1]
        it = items.get(sku)
        if not it: err(f"{line} — 품목에 없는 sku"); continue
        sold = sku in skuSold or it['name'] in nameSold
        rm = remain.get(sku)
        ok = sold if it['qty'] == 1 else (sold or rm is not None)
        if not ok:
            err(f"{sku} {it['name'][:32]} ({who}) — 어드민은 완료인데 구매페이지 미반영")
        n += 1
    print(f"   · 대조 {n}건")
else:
    print("── 4. 어드민 '완료' 대조 — 건너뜀 (관리메모 목록 파일을 주면 함께 봅니다)")

print()
print(f"결과: 오류 {bad} · 주의 {warn}")
sys.exit(1 if bad else 0)
PY
