const ENDPOINT = "https://script.google.com/macros/s/AKfycbx4wOLUzlKJYdBJEGH2J8I2NEQAz77lShix8bxDaNELDKEXHcs_XZ7-bZilpfBdANU_yA/exec";

let PW = "", DATA = null, BIDS = [], PREVIEW = false;

/* ============================================================
   시트의 옛 품목명 → 현재 배포 페이지 품목으로 매칭
   (시트·판매페이지는 안 건드리고 여기서만 변환해 표시)
   ============================================================ */
ITEMS.forEach(it => { it.num = 0; });
{ const c = {}; ITEMS.forEach(it => { c[it.cat] = (c[it.cat] || 0) + 1; it.num = c[it.cat]; }); }

// 자동 매칭이 안 되는 이름은 여기에 직접 지정 (시트 이름 : 현재 이름)
const ALIAS = {
  "Jemball Diffuser JBL-80": "Aurora Jemball Diffuser JBL-80",
  "낮은 수조 (100×80×10cm)": "아크릴 수조 (100×80×10cm)",
};
// 데이터가 아닌 값 (헤더가 섞여 들어온 것 등)
const JUNK = new Set(["품목", "품목명", "item", ""]);

// 시트에 오타로 남은 입찰자 이름 교정 (시트 원본은 건드리지 않고 표시만 통일)
const BIDDER_ALIAS = { "주용균 실장님": "주보균 실장님" };
const fixBidder = n => BIDDER_ALIAS[String(n || "").trim()] || String(n || "").trim();

const norm = s => String(s).toLowerCase()
  .replace(/[×x]\s*\d+/g, "")          // ×2, x3 같은 수량 표기 제거
  .replace(/["'`]/g, "")
  .replace(/[\s·,\-–—_]/g, "");        // 공백·구분자 제거

const BY_EXACT = new Map(), BY_NORM = new Map();
ITEMS.forEach(it => {
  for (const [m, k] of [[BY_EXACT, it.name], [BY_NORM, norm(it.name)]]) {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
});

/* 시트의 품목명 하나 → 현재 품목 목록.
   같은 이름 품목이 여러 개면(예: 원단 Gray 실크 10·13) 시트 카탈로그와 같이
   양쪽 모두에 입찰이 걸린 것으로 보고 번호별로 나눠서 반환한다. */
function resolveAll(raw) {
  const name = String(raw || "").trim();
  if (JUNK.has(name)) return null;

  /* 정산 행 — 통 결제라 품목별 금액을 모를 때 총액만 남기는 줄.
     판매 목록에 없는 이름이라 '미매칭'으로 보이면 오류처럼 읽히므로 따로 표시한다. */
  if (name.startsWith("💰")) {
    return [{ key: "settle|" + name, name: name.replace(/^💰\s*/, ""), cat: "정산",
              num: "", ask: 0, askUnit: "", status: "sold",
              matched: true, split: false, settle: true }];
  }

  const target = ALIAS[name] || name;

  let hit = null;
  const skuHit = ITEMS.find(x => x.sku && x.sku === String(name).trim());   // 시트에 sku 가 실려온 경우
  if (skuHit) hit = [skuHit];
  if (!hit) hit = BY_EXACT.get(target) || BY_NORM.get(norm(target));
  if (!hit) {
    // 한쪽이 다른 쪽을 포함 (브랜드 접두어가 붙거나 빠진 경우)
    const k = norm(target);
    const cands = ITEMS.filter(x => { const n = norm(x.name); return n.includes(k) || k.includes(n); });
    if (cands.length) hit = cands;
  }
  if (!hit || !hit.length)
    return [{ key: "?" + name, name, cat: "", num: null, matched: false, split: false }];

  return hit.map(it => ({
    key: it.sku || (it.cat + "#" + it.num), sku: it.sku, name: it.name,
    cat: CATS[it.cat], catKey: it.cat, num: it.num,
    ask: it.ask || 0, askUnit: it.askUnit || "", status: it.status,
    matched: true, split: hit.length > 1,
  }));
}

/* 시트에 010 앞자리 0이 잘려 저장된 번호 보기 좋게 */
function fmtContact(c) {
  const d = String(c || "").replace(/[^\d]/g, "");
  if (/^1\d{9}$/.test(d)) return "0" + d.slice(0, 2) + "-" + d.slice(2, 6) + "-" + d.slice(6);
  if (/^01\d{8,9}$/.test(d)) return d.replace(/^(01\d)(\d{3,4})(\d{4})$/, "$1-$2-$3");
  return String(c || "");
}

/* 같은 사람이 같은 품목에 중복 입찰한 경우 하나로 (먼저 넣은 시각 유지, 금액은 최신) */
function dedupe(bids) {
  const seen = new Map();
  bids.forEach(b => {
    const k = b.name + "|" + b.contact + "|" + b.resolved.key;
    const prev = seen.get(k);
    if (!prev) { seen.set(k, b); return; }
    prev.dupes = (prev.dupes || 1) + 1;
    if (b.price) prev.price = b.price;
    if (b.message) prev.message = b.message;
  });
  return [...seen.values()];
}

/* ---------- 헤더 이름으로 컬럼 찾기 (시트 구조가 달라도 동작) ---------- */
const KEYS = {
  ts:      ["타임", "시간", "일시", "날짜", "접수", "timestamp", "date", "time"],
  name:    ["이름", "입찰자", "구매자", "성함", "name"],
  contact: ["연락처", "전화", "휴대", "contact", "phone", "tel"],
  item:    ["품목", "제품", "장비", "item", "product"],
  price:   ["금액", "입찰가", "가격", "희망", "price", "amount"],
  message: ["메시지", "메모", "내용", "message", "memo", "note"],
  qty:     ["수량", "qty"],
};
function findCol(headers, key) {
  const cands = KEYS[key];
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").toLowerCase().replace(/\s/g, "");
    if (cands.some(c => h.includes(c.toLowerCase()))) return i;
  }
  return -1;
}

/* ---------- 시트들 중 입찰 시트 고르기 ---------- */
/* 입찰 원본 시트를 고른다.
   ⚠️ '품목별'·'카탈로그'는 입찰이 없는 품목까지 전부 나열하는 요약 시트라
      절대 원본으로 쓰면 안 된다(입찰이 없는데 있는 것처럼 보임).
      이름이 '입찰'인 시트를 최우선으로 쓰고, 없을 때만 헤더로 추정한다. */
const SUMMARY_SHEETS = ["품목별", "카탈로그", "판매상태", "관리메모"];

/* 후보 시트를 우선순위대로 나열한다 ('입찰' 먼저, 요약 시트는 제외) */
function bidSheetCandidates(sheets) {
  const out = [];
  sheets.forEach(sh => {
    if (String(sh.sheet).trim() === "입찰" && (sh.rows || []).length) out.push(sh);
  });
  sheets.forEach(sh => {
    if (out.includes(sh)) return;
    if (SUMMARY_SHEETS.includes(String(sh.sheet).trim())) return;   // 요약 시트 제외
    const h = sh.headers || [];
    let score = 0;
    ["name", "item", "price", "contact"].forEach(k => { if (findCol(h, k) >= 0) score++; });
    if (score >= 2 && (sh.rows || []).length) out.push(sh);
  });
  return out;
}

/* 후보를 차례로 시도해 실제로 입찰이 나오는 시트를 쓴다 */
let PICKED_SHEET = null, TRIED = [], LAST_COLMAP = null, COLMAP_NOTE = "";
function loadBidsFrom(sheets) {
  TRIED = []; PICKED_SHEET = null;
  for (const sh of bidSheetCandidates(sheets)) {
    const rows = dedupe(normalize(sh));
    TRIED.push({ name: sh.sheet, rows: (sh.rows || []).length, bids: rows.length });
    if (rows.length) { PICKED_SHEET = sh; return rows; }
  }
  return [];
}

/* ---------- 행 → 입찰 목록 정규화 ---------- */
function normalize(sheet) {
  const h = sheet.headers, out = [];
  const c = {
    ts: findCol(h, "ts"), name: findCol(h, "name"), contact: findCol(h, "contact"),
    item: findCol(h, "item"), price: findCol(h, "price"), message: findCol(h, "message"),
    qty: findCol(h, "qty"),
  };

  /* 헤더 글자로 열을 못 찾는 경우가 있다(헤더가 없거나 다른 말로 적혀 있음).
     '입찰' 시트는 열 순서가 정해져 있으므로 위치로 대체한다.
     접수시각 | 이름 | 연락처 | 품목 | 희망가 | 메시지                    */
  if (c.name < 0 || c.item < 0) {
    const isBidSheet = String(sheet.sheet).trim() === "입찰" ||
      (sheet.rows || []).some(r => (r || []).length >= 4);
    if (isBidSheet) {
      if (c.ts < 0) c.ts = 0;
      if (c.name < 0) c.name = 1;
      if (c.contact < 0) c.contact = 2;
      if (c.item < 0) c.item = 3;
      if (c.price < 0) c.price = 4;
      if (c.message < 0) c.message = 5;
      if (c.qty < 0) c.qty = 7;              // H열 (G=sku 다음)
      COLMAP_NOTE = `헤더를 못 읽어 열 위치로 대체함 (헤더: ${JSON.stringify(h)})`;
    }
  }
  LAST_COLMAP = c;
  sheet.rows.forEach((row, ri) => {
    const get = i => (i >= 0 && row[i] != null ? String(row[i]).trim() : "");
    const name = fixBidder(get(c.name)), itemRaw = get(c.item);
    // 입찰자 이름이 없는 행은 실제 입찰이 아니다 (요약 시트의 빈 행 등) → 제외
    if (!name || !itemRaw || JUNK.has(name)) return;
    // 한 셀에 여러 품목이 줄바꿈으로 들어있는 경우 분리
    const parts = itemRaw ? itemRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [""];
    const priceRaw = get(c.price);
    parts.forEach(p => {
      let item = p, price = priceRaw;
      /* "[번호] 품목명 — 12000원"처럼 한 칸에 금액이 같이 적힌 옛 형식만 분리한다.
         금액 열이 따로 있으면 건드리지 않는다 —
         'Jemball Diffuser JBL-80'이 '…JBL' + 80원으로 쪼개지던 문제. */
      if (!priceRaw) {
        const m = p.match(/^(.*?)\s+[—–]\s*([\d,]+)\s*원?$/);
        if (m) { item = m[1]; price = m[2]; }
      }
      item = item.replace(/^\[\d+\]\s*/, "").trim();
      const list = resolveAll(item);
      if (!list) return;                    // 헤더 등 데이터 아닌 값은 제외
      const qn = parseInt(get(c.qty), 10);
      list.forEach(rs => out.push({
        ts: get(c.ts), name, contact: get(c.contact), message: get(c.message),
        qty: qn >= 1 && qn <= 99 ? qn : null,           // 신청 수량 (옛 입찰엔 없음)
        item, resolved: rs, price: (price || "").replace(/[^\d]/g, ""), row: ri + 2,
      }));
    });
  });
  return out;
}

/* 취소한 입찰 — 목록엔 남기되 순위에서는 뺀다 */
const uidOf = b => b.uid || (b.resolved.key + "|" + b.name + "|" + b.row);
const isDropped = b => (OV[uidOf(b)] || {}).state === "drop";

/* ---------- 품목별 그룹 + 순위 ---------- */
function group(bids) {
  const map = new Map();
  bids.forEach(b => {
    const k = b.resolved.key;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(b);
  });
  // 접수 순서 = 시트 행 순서 (타임스탬프 있으면 우선)
  map.forEach(list => {
    list.sort((a, b) => {
      const ta = Date.parse(a.ts), tb = Date.parse(b.ts);
      if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
      return a.row - b.row;
    });
    let n = 0;
    list.forEach(b => { b.rank = isDropped(b) ? 0 : ++n; });   // 취소 건은 순위 없음
  });
  return map;
}

const won = n => n ? "₩" + Number(n).toLocaleString() : "";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
