/* ============================================================
   표 보기
   ============================================================ */
let VIEW = "grid", SORT = { col: "cat", dir: 1 }, SEL = new Set();

/* ============================================================
   상태 · 입찰가 수정 (브라우저 localStorage에 저장 → 내보내기로 반영)
   ============================================================ */
const STATE_LABEL = { bid: "입찰", done: "거래완료", drop: "취소 (입찰 삭제)" };
const STATE_ORDER = { bid: 0, done: 1, drop: 2 };
const OV_KEY = "gearAdminOverrides", NOTE_KEY = "gearAdminNotes";
let OV = {}, NOTES = {};
try { OV = JSON.parse(localStorage.getItem(OV_KEY) || "{}"); } catch { OV = {}; }
let OV_MIGRATED = false;   // ITEMS 준비 후 migrateOV 로 한 번 옮긴다
try { NOTES = JSON.parse(localStorage.getItem(NOTE_KEY) || "{}"); } catch { NOTES = {}; }
const saveOV = () => localStorage.setItem(OV_KEY, JSON.stringify(OV));
const saveNotes = () => localStorage.setItem(NOTE_KEY, JSON.stringify(NOTES));

/* 거래 메모는 입찰자 단위 (만날 시간·장소·거래 방법) */
const noteKey = r => r.name + "|" + r.contact;
const noteOf = r => NOTES[noteKey(r)] || "";
function setNote(k, v) {
  if (v) NOTES[k] = v; else delete NOTES[k];
  saveNotes();
}

let SHEET_SOLD = new Set();                    // 시트에 저장된 판매완료 품목

/* 이 품목에 '거래완료'로 명시된 입찰이 따로 있으면, 품목명 단위 폴백을 쓰지 않는다.
   폴백은 "누가 샀는지 모를 때"의 최후 수단인데, 낙찰자가 정해진 뒤에도 적용되면
   같은 품목의 탈락자까지 거래완료로 보이고 매출 합계가 부풀려진다. */
const hasNamedWinner = name => Object.keys(OV).some(k => {
  if (OV[k].state !== "done") return false;
  const b = ROWMAP && ROWMAP.get(k);
  return b && b.rs.name === name;
});

const stateOf = r => {
  const s = OV[r.uid] && OV[r.uid].state;
  if (s && STATE_LABEL[s]) return s;           // 지금은 안 쓰는 옛 값(예약확정)은 입찰로 취급
  if (SHEET_SOLD.has(r.rs.name)) return hasNamedWinner(r.rs.name) ? "bid" : "done";
  return r.rs.status === "sold" ? (hasNamedWinner(r.rs.name) ? "bid" : "done") : "bid";
};

/* 다른 기기에서 바꾼 판매상태 가져오기 (공개 조회라 비밀번호 불필요) */
async function pullStatus() {
  try {
    const d = await (await fetch(ENDPOINT + "?action=status")).json();
    if (d && d.ok) {
      SHEET_SOLD = new Set(d.sold || []);
      // 남은수량도 받아와야 새로고침 후 "몇 개 남았나" 를 서버 기준으로 묻는다
      const rm = d.remain || {};
      ITEMS.forEach(it => { if (it.sku && rm[it.sku] != null) it.remain = +rm[it.sku]; });
      // 시트에서 판매중으로 되돌린 품목은 로컬의 거래완료 표시도 해제
      new Set(d.sale || []).forEach(name => {
        Object.keys(OV).forEach(uid => {
          const r = ROWMAP.get(uid);
          if (r && r.rs.name === name && OV[uid].state === "done") { delete OV[uid].state; }
        });
      });
      saveOV();
      return true;
    }
  } catch { /* 실패해도 로컬 값으로 계속 */ }
  return false;
}
const priceOf = r => {
  const o = OV[r.uid];
  return o && o.price != null ? String(o.price) : String(r.rawPrice ?? r.price ?? "");
};
/* ---------- 시트에 판매상태 저장 → 구매페이지 실시간 반영 ---------- */
function adminPw() {
  let pw = sessionStorage.getItem("adminPw");
  if (!pw) {
    pw = prompt("구매페이지에 반영하려면 관리자 비밀번호가 필요해요.\n(취소하면 이 브라우저에만 저장됩니다)");
    if (pw) sessionStorage.setItem("adminPw", pw);
  }
  return pw;
}

let SYNC_T = 0;
function syncFlag(msg, cls) {
  const el = document.getElementById("syncmsg");
  if (!el) return;
  clearTimeout(SYNC_T);
  el.textContent = msg; el.className = "syncmsg " + (cls || "");
  if (cls === "ok") SYNC_T = setTimeout(() => { el.textContent = ""; el.className = "syncmsg"; }, 2500);
}

async function callSheet(payload) {
  const res = await fetch(ENDPOINT, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  let d;
  try { d = JSON.parse(txt); }
  catch { throw new Error(res.ok ? "서버 응답을 읽지 못했어요 (Apps Script 재배포 중일 수 있어요)" : "서버 오류 " + res.status); }
  if (!d.ok) throw new Error(d.error === "unauthorized" ? "비밀번호가 맞지 않아요" : d.error);
  return d;
}

async function pushStatus(itemName, status, opt) {
  if (opt && opt.skip) {          // 정산행·미매칭행은 구매페이지에 없는 이름이라 보내봐야 소용없다
    syncFlag("이 행은 구매페이지에 반영되지 않아요 (정산·미매칭 행)", "");
    return;
  }
  const pw = adminPw();
  if (!pw) { syncFlag("구매페이지 미반영 (비밀번호 없음)", "err"); return; }
  syncFlag("구매페이지에 반영 중…");
  try {
    const it = { name: itemName, status };
    if (opt && opt.sku) it.sku = opt.sku;
    if (opt && opt.remain != null) it.remain = opt.remain;   // 수량 일부만 팔린 경우
    await callSheet({ action: "setStatus", pw, items: [it] });
    const tail = opt && opt.remain != null && opt.remain > 0 ? ` (${opt.remain}개 남음)` : "";
    syncFlag(`구매페이지 반영됨 · ${itemName} → ${status === "sold" ? "판매완료" : "판매중"}${tail}`, "ok");
  } catch (e) {
    if (/비밀번호/.test(e.message)) sessionStorage.removeItem("adminPw");
    syncFlag("구매페이지 반영 실패: " + e.message + " (로컬에는 저장됨)", "err");
  }
}

/* 금액수정·거래메모를 시트에 저장 (기기·브라우저 바뀌어도 유지) */
/* 메모 카드 — 표가 overflow:auto 라 셀 안에 두면 잘려서, 화면에 고정으로 띄운다 */
function closeNotePop() {
  document.getElementById("notepop")?.classList.remove("show");
  document.querySelectorAll("td.note.open, td.msg.open").forEach(o => o.classList.remove("open"));
}
function openNotePop(td, text) {
  let pop = document.getElementById("notepop");
  if (!pop) { pop = document.createElement("div"); pop.id = "notepop"; document.body.appendChild(pop); }
  pop.textContent = text;
  pop.classList.add("show");
  td.classList.add("open");
  const c = td.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
  const below = c.bottom + h + 10 <= innerHeight;              // 아래가 좁으면 위로 띄운다
  pop.style.top  = (below ? c.bottom - 3 : c.top - h + 3) + "px";
  pop.style.left = Math.max(8, Math.min(c.left + 4, innerWidth - w - 8)) + "px";
}

async function pushOverride(kind, key, value, label) {
  const pw = adminPw();
  if (!pw) { syncFlag("시트 미저장 (비밀번호 없음) — 이 브라우저에만 남아요", "err"); return; }
  syncFlag("저장 중…");
  try {
    await callSheet({ action: "setOverride", pw, kind, key, value });
    syncFlag(`저장됨 · ${label}`, "ok");
  } catch (e) {
    if (/비밀번호/.test(e.message)) sessionStorage.removeItem("adminPw");
    syncFlag("시트 저장 실패: " + e.message + " (로컬에는 저장됨)", "err");
  }
}

/* 시트에 저장된 금액수정·거래메모 가져와 합치기 (시트 값이 우선) */
async function pullOverrides() {
  const pw = sessionStorage.getItem("adminPw");
  if (!pw) return false;
  try {
    const d = await callSheet({ action: "getOverrides", pw });
    if (!OV_MIGRATED) { OV = migrateOV(OV); saveOV(); OV_MIGRATED = true; }
    /* 시트에서 지워진 항목은 로컬에서도 지운다 (병합만 하면 지운 값이 되살아남) */
    const keepPrice = new Set(Object.keys(d.price || {}).map(migrateUid));
    const keepState = new Set(Object.keys(d.state || {}).map(migrateUid));
    Object.keys(OV).forEach(k => {
      if (OV[k].price != null && !keepPrice.has(k)) delete OV[k].price;
      if (OV[k].state && !keepState.has(k)) delete OV[k].state;
      if (OV[k].price == null && !OV[k].state) delete OV[k];
    });
    const keepNote = new Set(Object.keys(d.note || {}));
    Object.keys(NOTES).forEach(k => { if (!keepNote.has(k)) delete NOTES[k]; });
    Object.entries(d.price || {}).forEach(([uid, v]) => {
      const k = migrateUid(uid);
      OV[k] = Object.assign({}, OV[k], { price: v });
    });
    Object.entries(d.state || {}).forEach(([uid, v]) => {      // 취소 상태도 기기 간에 공유
      const k = migrateUid(uid);
      OV[k] = Object.assign({}, OV[k], { state: v });
    });
    NOTES = Object.assign({}, NOTES, d.note || {});
    saveOV(); saveNotes();
    return true;
  } catch (e) {
    if (/비밀번호/.test(e.message)) { sessionStorage.removeItem("adminPw"); PW = ""; }
    return false;
  }
}

/* 예전 uid 는 앞머리가 cat#num 이었다. 품목을 넣고 빼면 이 번호가 밀려
   저장해둔 금액수정·취소가 엉뚱한 입찰에 붙었으므로, 안 밀리는 sku 로 옮긴다. */
const KEYMAP = {};
ITEMS.forEach(it => { if (it.sku) KEYMAP[it.cat + "#" + it.num] = it.sku; });
function migrateUid(k) {
  const i = String(k).indexOf("|");
  if (i < 0) return k;
  const head = k.slice(0, i);
  return (KEYMAP[head] || head) + k.slice(i);
}
function migrateOV(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => { out[migrateUid(k)] = v; });
  return out;
}

function setOV(uid, patch) {
  OV[uid] = Object.assign({}, OV[uid], patch);
  if (!OV[uid].state && OV[uid].price == null) delete OV[uid];
  saveOV();
}
