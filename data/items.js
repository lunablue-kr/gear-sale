// 품목 데이터 — 카테고리별로 data/items/*.js 에 나뉘어 있음.
//   고칠 때는 해당 카테고리 파일만 열면 됨 (예: 원단 → data/items/fabric.js)
//   status: 'sale' 판매중 | 'hold' 예약중 | 'sold' 판매완료
//   ask: 희망가(원), askUnit: "대당" 등. 없으면 "시세 확인 중"
const CATS = {
  camera: "카메라 · 액세서리",
  strobe: "스트로보 · 조명",
  mod:    "모디파이어",
  grip:   "스탠드 · 그립",
  pc:     "컴퓨터 · 모니터",
  bg:     "배경지",
  fabric: "원단",
  propA:  "소품 · 유리/아크릴",
  propB:  "소품 · 기타",
  office: "사무용품 · 집기",
  etc:    "기타",
};

// 카테고리 파일들이 P에 채운 뒤 여기서 순서대로 합친다
const ITEMS = Object.keys(CATS).flatMap(k => P[k] || []);
ITEMS.forEach((it, i) => it.id = i);
