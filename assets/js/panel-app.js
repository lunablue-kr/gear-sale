async function load(pw) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "bids", pw }),
  });
  const text = await res.text();
  let d;
  try { d = JSON.parse(text); }
  catch { throw new Error("서버 응답을 읽지 못했어요. Apps Script 배포 상태를 확인해 주세요."); }
  if (!d.ok) throw new Error(d.error === "unauthorized" ? "비밀번호가 맞지 않아요." : (d.error || "조회 실패"));
  return d;
}

async function enter(pw) {
  const msg = document.getElementById("gate-msg");
  const btn = document.getElementById("login");
  msg.textContent = "확인 중…"; msg.className = ""; btn.disabled = true;
  try {
    DATA = await load(pw);
    PW = pw;
    sessionStorage.setItem("adminPw", pw);
    BIDS = loadBidsFrom(DATA.sheets || []);
    document.getElementById("gate").classList.add("hide");
    document.getElementById("app").classList.remove("hide");
    render(); renderRaw();
    refreshFromSheet();      // 다른 기기에서 적은 메모·금액수정도 가져온다
  } catch (e) {
    msg.textContent = e.message; msg.className = "err";
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 미리보기: 공개 엔드포인트의 예약 품목명만 표시 ---------- */
async function previewMode() {
  const msg = document.getElementById("gate-msg");
  const btn = document.getElementById("preview");
  msg.textContent = "불러오는 중…"; msg.className = ""; btn.disabled = true;
  try {
    const d = await (await fetch(ENDPOINT)).json();
    const names = (d && d.reserved) || [];
    // 현재 품목으로 매칭한 뒤 중복 제거 (옛 이름·새 이름이 같은 품목이면 한 장으로 합쳐짐)
    const seen = new Set();
    BIDS = [];
    names.forEach((n, i) => {
      (resolveAll(n) || []).forEach(rs => {
        if (seen.has(rs.key)) return;
        seen.add(rs.key);
        BIDS.push({ ts:"", name:"", contact:"", message:"", item:n, resolved:rs, price:"", row:i+2 });
      });
    });
    PREVIEW = true;
    document.getElementById("gate").classList.add("hide");
    document.getElementById("app").classList.remove("hide");
    const b = document.getElementById("banner");
    b.className = "banner";
    b.innerHTML = `<b>미리보기 모드</b> — 공개 데이터로 <b>예약된 품목 ${BIDS.length}개</b>만 표시 중입니다.
      입찰자 이름·연락처·금액·순위는 Apps Script에 <code>adminBids_</code> 설치 후 비밀번호로 들어와야 보여요.`;
    document.getElementById("sort").value = "name";
    ["addbid", "export"].forEach(id => document.getElementById(id)?.classList.add("hide"));
    render(); document.getElementById("raw").innerHTML = "<p style='font-size:13px;color:var(--sub)'>미리보기 모드에선 원본 데이터를 불러올 수 없어요.</p>";
  } catch (e) {
    msg.textContent = "불러오지 못했어요: " + e.message; msg.className = "err";
  } finally { btn.disabled = false; }
}

/* 시트에서 판매상태 + 금액수정 + 거래메모를 한 번에 당겨온다 */
async function refreshFromSheet() {
  const gotStatus = await pullStatus();
  const gotOv = await pullOverrides();
  BIDS.forEach(b => { if (b.rawPrice !== undefined) b.price = b.rawPrice; });  // 덮어쓴 값 초기화 후 재적용
  render();                       // 카드 보기에서도 반영되도록 (renderGrid 만 부르면 표만 갱신됨)
  if (gotStatus && gotOv) syncFlag("시트에서 최신 내용 불러옴", "ok");
  else if (gotStatus) syncFlag("판매상태만 갱신됨 (금액·메모는 비밀번호 필요)", "");
  else syncFlag("시트 조회 실패 — 로컬 저장분으로 표시 중", "err");
}

/* ---------- 로컬 스냅샷 모드: data/bids-local.js 가 있으면 그걸로 표시 ---------- */
function localMode() {
  const rows = [];
  BIDS_SEED.forEach(r => {
    (resolveAll(r.item) || []).forEach(rs =>
      rows.push({ ...r, resolved: rs, price: String(r.price || "").replace(/[^\d]/g, "") }));
  });
  BIDS = dedupe(rows);
  PREVIEW = false;
  document.getElementById("gate").classList.add("hide");
  document.getElementById("app").classList.remove("hide");
  const b = document.getElementById("banner");
  b.className = "banner";
  b.innerHTML = `<b>로컬 스냅샷</b> — <code>data/bids-local.js</code>의 시트 사본을 보고 있어요
    (배포본에는 포함되지 않습니다). 시트에 새 입찰이 들어오면 이 파일을 갱신해야 최신이 돼요.`;
  render();
  // 시트에 저장된 판매상태·금액수정·거래메모를 가져와 반영 (다른 기기 포함)
  refreshFromSheet();
  document.getElementById("reload").onclick = async () => {
    const b = document.getElementById("reload");
    b.disabled = true; b.textContent = "불러오는 중…";
    await refreshFromSheet();
    b.disabled = false; b.textContent = "새로고침";
  };
  document.getElementById("raw").innerHTML =
    "<p style='font-size:13px;color:var(--sub)'>로컬 스냅샷 모드에선 시트 원본을 불러오지 않아요.</p>";
}

document.getElementById("preview").onclick = previewMode;
document.getElementById("login").onclick = () => enter(document.getElementById("pw").value);
document.getElementById("pw").onkeydown = e => { if (e.key === "Enter") document.getElementById("login").click(); };
document.getElementById("q").oninput = render;
document.getElementById("sort").onchange = render;
document.getElementById("cat").onchange = render;
document.getElementById("who").onchange = render;
document.getElementById("group").onchange = render;
/* ============================================================
   입찰 추가·수정·삭제 — 구글시트를 열지 않고 여기서 처리
   ============================================================ */
let EDIT_ROW = 0;   // 0이면 새로 추가, 아니면 그 시트 행을 수정

function openBidModal(row) {
  EDIT_ROW = row || 0;
  const m = document.getElementById("bidmodal");
  const src = EDIT_ROW ? [...ROWMAP.values()].find(b => b.row === EDIT_ROW) : null;

  document.getElementById("bm-title").textContent = EDIT_ROW ? "입찰 수정" : "입찰 추가";
  document.getElementById("bm-item").value    = src ? src.item : "";
  document.getElementById("bm-name").value    = src ? src.name : "";
  document.getElementById("bm-contact").value = src ? src.contact : "";
  document.getElementById("bm-price").value   = src ? (src.rawPrice ?? src.price ?? "") : "";
  document.getElementById("bm-ts").value      = src ? src.ts : "";
  document.getElementById("bm-msg").value     = src ? src.message : "";
  document.getElementById("bm-msg-out").textContent = "";

  // 품목 자동완성 목록
  document.getElementById("bm-items").innerHTML =
    ITEMS.map(it => `<option value="${esc(it.name)}">`).join("");

  m.classList.add("show");
  document.getElementById("bm-item").focus();
}
const closeBidModal = () => document.getElementById("bidmodal").classList.remove("show");

async function saveBid() {
  const out = document.getElementById("bm-msg-out");
  const btn = document.getElementById("bm-save");
  const bid = {
    item: document.getElementById("bm-item").value.trim(),
    name: document.getElementById("bm-name").value.trim(),
    contact: document.getElementById("bm-contact").value.trim(),
    price: document.getElementById("bm-price").value.replace(/[^\d]/g, ""),
    ts: document.getElementById("bm-ts").value.trim(),
    message: document.getElementById("bm-msg").value.trim(),
  };
  if (!bid.item || !bid.name) {
    out.textContent = "품목과 입찰자 이름은 필요해요."; out.className = "msg err"; return;
  }
  const pw = adminPw();
  if (!pw) { out.textContent = "비밀번호가 필요해요."; out.className = "msg err"; return; }

  btn.disabled = true; btn.textContent = "저장 중…";
  try {
    // 그 사이 시트 행이 밀렸을 수 있으므로, 고치려는 대상이 맞는지 서버가 확인하게 한다
    const before = EDIT_ROW ? [...ROWMAP.values()].find(b => b.row === EDIT_ROW) : null;
    const expect = before ? { name: before.name, item: before.rs.name } : null;
    await callSheet({ action: "editBid", pw, op: EDIT_ROW ? "update" : "add", row: EDIT_ROW, bid, expect });
    closeBidModal();
    syncFlag(EDIT_ROW ? "입찰을 고쳤어요" : "입찰을 추가했어요", "ok");
    await reloadBids();
  } catch (e) {
    out.textContent = "저장 실패: " + e.message; out.className = "msg err";
  } finally {
    btn.disabled = false; btn.textContent = "저장";
  }
}

/* 취소 = 입찰 삭제 + 순위 당김 + (마지막 입찰이면) 구매페이지 판매중 복원 */
async function cancelBid(r) {
  const wasDone = stateOf(r) === "done";
  const others = [...ROWMAP.values()]
    .filter(o => o.rs.name === r.rs.name && o.uid !== r.uid && !isDropped(o))
    .sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const label = `${r.rs.name} · ${r.name}` + (r.price ? ` · ${Number(r.price).toLocaleString()}원` : "");
  const tail = others.length
    ? `\n\n같은 품목에 입찰 ${others.length}건이 남아 있어요.\n${others[0].name} 님이 1순위가 됩니다.`
    : `\n\n남은 입찰이 없어 구매 페이지에서 다시 판매중으로 바뀝니다.`;
  if (!confirm(`이 입찰을 취소할까요?\n\n${label}${tail}\n\n목록에는 취소 기록으로 남습니다.`)) return false;
  setOV(r.uid, { state: "drop" });
  renderGrid(); renderStats();
  pushOverride("state", r.uid, "drop", `${r.name} 취소`);
  // 거래완료였다면 남은 입찰이 있어도 판매완료를 풀어야 한다 (다음 순위가 살아나야 함)
  if (!others.length || wasDone) pushStatus(r.rs.name, "sale",
    { sku: r.rs.sku, remain: (ITEMS.find(x => x.sku === r.rs.sku) || {}).qty || null,
      skip: r.rs.settle || r.rs.matched === false });
  syncFlag(others.length ? `취소됨 · ${others[0].name} 님이 1순위` : `취소됨 · ${r.rs.name} 다시 판매중`, "ok");
  return true;
}


/* 시트에서 입찰을 다시 읽어 화면 갱신 */
async function reloadBids() {
  const pw = sessionStorage.getItem("adminPw");
  if (!pw) return;
  try {
    DATA = await load(pw);
    BIDS = loadBidsFrom(DATA.sheets || []);
    render(); renderRaw();
  } catch (e) { syncFlag("다시 읽지 못했어요: " + e.message, "err"); }
}

document.getElementById("addbid").onclick = () => openBidModal(0);
document.getElementById("bm-cancel").onclick = closeBidModal;
document.getElementById("bm-save").onclick = saveBid;
document.getElementById("bidmodal").addEventListener("click", e => {
  if (e.target.id === "bidmodal") closeBidModal();
});

document.getElementById("state").onchange = render;
document.getElementById("filtoggle").onclick = () => {
  const f = document.getElementById("filters");
  const on = f.classList.toggle("open");
  document.getElementById("filtoggle").classList.toggle("on", on);
};
document.getElementById("selclear").onclick = () => { SEL.clear(); render(); };

/* 상태·금액 변경분을 items.js에 반영할 형태로 뽑아내기 */
document.getElementById("export").onclick = () => {
  const rows = buildRows();
  const done = rows.filter(r => stateOf(r) === "done");
  const dropped = rows.filter(r => stateOf(r) === "drop");
  const edited = rows.filter(r => r.edited);
  if (!done.length && !dropped.length && !edited.length) { alert("변경한 내용이 없어요."); return; }

  const line = r => `  [${r.rs.cat} ${r.rs.num}] ${r.rs.name} — ${r.name}` +
    (r.price ? ` ${Number(r.price).toLocaleString()}원` : "");
  const uniq = list => [...new Map(list.map(r => [r.rs.key, r])).values()];

  const txt = [
    "# 장비판매 상태 변경 (" + new Date().toLocaleString("ko-KR") + ")",
    "",
    "## items.js 에서 status:\"sold\" 로 바꿀 품목",
    ...uniq(done).map(r => `  ${r.rs.name}`),
    "",

    "## 거래완료 상세",
    ...done.map(line),
    "",
    "## 취소된 입찰",
    ...dropped.map(line),
    "",
    "## 입찰가 수정분 (원본 → 수정)",
    ...edited.map(r => `  [${r.rs.cat} ${r.rs.num}] ${r.rs.name} / ${r.name} : ` +
      `${r.rawPrice ? Number(r.rawPrice).toLocaleString() : "미기재"} → ${r.price ? Number(r.price).toLocaleString() : "미기재"}`),
    "",
    "## 내 메모 (거래 약속)",
    ...Object.entries(NOTES).map(([k, v]) => `  ${k.split("|")[0]} : ${v}`),
  ].join("\n");

  navigator.clipboard.writeText(txt).then(
    () => alert("백업 텍스트를 복사했어요.\n(상태·금액·메모는 이미 시트에 저장돼 있어요. 이건 기록용 사본이에요.)\n\n" + txt.slice(0, 400)),
    () => prompt("복사가 안 돼서 직접 복사해 주세요", txt));
};
document.getElementById("view").onclick = () => {
  VIEW = VIEW === "grid" ? "cards" : "grid";
  const grid = VIEW === "grid";
  document.getElementById("grid").classList.toggle("hide", !grid);
  document.getElementById("list").classList.toggle("hide", grid);
  document.getElementById("group").classList.toggle("hide", !grid);
  document.getElementById("sort").classList.toggle("hide", grid);
  document.getElementById("view").textContent = grid ? "카드로 보기" : "표로 보기";
  if (!grid) { SEL.clear(); document.getElementById("selbar").classList.add("hide"); }
  render();
};
document.getElementById("reload").onclick = async () => {
  const btn = document.getElementById("reload");
  if (PREVIEW) {
    btn.disabled = true; btn.textContent = "불러오는 중…";
    try {
      const d = await (await fetch(ENDPOINT)).json();
      if (d && d.reserved) {
        const seen = new Set();
        BIDS = [];
        d.reserved.forEach((n, i) => {          // resolved 를 채워야 render 가 돌아간다
          (resolveAll(n) || []).forEach(rs => {
            if (seen.has(rs.key)) return;
            seen.add(rs.key);
            BIDS.push({ ts:"", name:"", contact:"", message:"", item:n, resolved:rs, price:"", row:i+2 });
          });
        });
        render();
      }
    } catch (e) { syncFlag("불러오지 못했어요: " + e.message, "err"); }
    finally { btn.disabled = false; btn.textContent = "새로고침"; }
    return;
  }
  btn.disabled = true; btn.textContent = "불러오는 중…";
  try {
    DATA = await load(PW);
    BIDS = loadBidsFrom(DATA.sheets || []);
    render(); renderRaw();
  } catch (e) { alert(e.message); }
  btn.disabled = false; btn.textContent = "새로고침";
};

// 로컬 스냅샷이 있으면 그걸로 바로, 없으면 세션 비번으로 자동 로그인
const saved = sessionStorage.getItem("adminPw");
if (typeof BIDS_SEED !== "undefined") {
  localMode();
} else if (saved) {
  // 판매 페이지에서 이미 비밀번호를 확인했으므로 입력창을 다시 보여주지 않는다.
  // 불러오는 동안에는 안내만 보이고, 실패했을 때만 입력창이 나타난다.
  const gate = document.getElementById("gate");
  gate.querySelector("input").classList.add("hide");
  gate.querySelector("#login").classList.add("hide");
  gate.querySelector("#preview").classList.add("hide");
  gate.querySelector("p").textContent = "불러오는 중…";
  enter(saved).then(() => {
    if (!document.getElementById("gate").classList.contains("hide")) {
      // 실패해서 게이트가 남아 있으면 입력창을 다시 보여준다
      gate.querySelector("input").classList.remove("hide");
      gate.querySelector("#login").classList.remove("hide");
      gate.querySelector("#preview").classList.remove("hide");
      gate.querySelector("p").textContent = "관리자 비밀번호를 입력하세요.";
    }
  });
}
