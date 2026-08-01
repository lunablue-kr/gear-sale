#!/bin/bash
# 배포 시점의 판매 상태를 정적 파일로 구워 둔다.
# 첫 방문자는 서버 응답(2~3초)을 기다리지 않고 즉시 정확한 상태를 본다.
#   사용법:  ./snapshot.sh   (배포 직전에 실행)

cd "$(dirname "$0")" || exit 1
EP="https://script.google.com/macros/s/AKfycbx4wOLUzlKJYdBJEGH2J8I2NEQAz77lShix8bxDaNELDKEXHcs_XZ7-bZilpfBdANU_yA/exec"

python3 - "$EP" <<'PY'
import sys, json, urllib.request, datetime
EP = sys.argv[1]
try:
    reserved = json.load(urllib.request.urlopen(EP, timeout=30)).get("reserved", [])
    st = json.load(urllib.request.urlopen(EP + "?action=status", timeout=30))
except Exception as e:
    print("✗ 서버 조회 실패 — 스냅샷 갱신 안 함:", e)
    raise SystemExit(1)
if not st.get("ok"):
    print("✗ 판매상태 응답 이상 — 스냅샷 갱신 안 함"); raise SystemExit(1)

snap = {
    "t": datetime.datetime.now().isoformat(timespec="seconds"),
    "reserved": reserved,
    "sold": st.get("sold", []),
    "sale": st.get("sale", []),
    "remain": st.get("remain", {}),
}
body = ("/* 배포 시점 판매 상태 — ./snapshot.sh 가 만든다. 직접 고치지 말 것.\n"
        "   첫 방문자가 서버 응답(2~3초)을 기다리지 않게 하는 용도. */\n"
        "const STATUS_SNAPSHOT = " + json.dumps(snap, ensure_ascii=False) + ";\n")
open("data/status-snapshot.js", "w", encoding="utf-8").write(body)
print(f"✓ 스냅샷 갱신  예약 {len(snap['reserved'])} · 판매완료 {len(snap['sold'])} · "
      f"판매중지정 {len(snap['sale'])} · 남은수량 {len(snap['remain'])}")
PY
