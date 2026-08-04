/* ---------- 품목 단위 거래 현황 (품목 셀 소줄 + 탭 팝업) ----------
   입찰자별·품목별 화면을 오가며 헷갈리지 않게, 품목 셀만 봐도
   "누구랑 몇 개 진행중인지" 보이게 한다. */
let BRIEF = new Map();
function makeBrief(rows) {
  const m = new Map();
  rows.forEach(r => {
    if (!m.has(r.rs.key)) m.set(r.rs.key, []);
    m.get(r.rs.key).push(r);
  });
  m.forEach(list => list.sort((a, b) => (a.rank || 99) - (b.rank || 99)));
  return m;
}
function qtyOf(rs) {
  const it = ITEMS.find(x => x.sku === rs.sku) || {};
  const total = it.qty || 1;
  return { total, remain: it.remain != null ? it.remain : total };
}
/* 품목의 모든 행에 붙는 요약 소줄: 거래 진행중인 사람과 수량만 (나머지는 탭 팝업으로)
   — 첫 행에만 붙이면 정렬·묶기에 따라 엉뚱한 곳에 가 있어서 매 행에 보여준다 */
function briefHTML(r) {
  const prog = (BRIEF.get(r.rs.key) || []).filter(x => stateOf(x) === "prog");
  if (!prog.length) return "";
  /* 남은 수량을 넘는 건은 표기하지 않는다 (상태는 그대로 진행중) —
     1개 남았는데 진행중 2명이면 앞순위 1명만 보여준다. */
  const { remain } = qtyOf(r.rs);
  const parts = [];
  let used = 0;
  for (const x of prog) {                    // BRIEF 는 순위순 정렬돼 있다
    const q = x.qty || 1;
    if (used + q > remain) continue;
    used += q;
    parts.push(`<i class="d d-prog"></i>${esc(x.name)} ${q}개`);
  }
  return parts.length ? `<span class="ibrief">${parts.join(" · ")}</span>` : "";
}
/* 품목 셀 탭 → 그 품목의 전체 현황 팝업 (순위·수량·상태·거래 메모) */
function itemPopText(key) {
  const list = BRIEF.get(key) || [];
  if (!list.length) return "";
  const lbl = { bid: "미처리", contact: "연락함", prog: "진행중", done: "판매완료" };
  const { total, remain } = qtyOf(list[0].rs);
  const L = [];
  if (total > 1) L.push(`${total}개 중 ${remain}개 남음`);
  list.forEach(x => {
    const s = stateOf(x);
    if (s === "drop") return;
    const note = noteOf(x);
    L.push(`${x.rank || "-"}순위 ${x.name} ×${x.qty || 1} — ${lbl[s] || s}` +
      (x.price ? ` · ${won(x.price)}` : "") +
      (note && s !== "done" ? `\n   📌 ${note}` : ""));
  });
  const drops = list.filter(x => stateOf(x) === "drop").length;
  if (drops) L.push(`(취소 ${drops}건 제외)`);
  return L.join("\n");
}

const COLS = [
  { k: "item",  label: "품목",     get: r => r.rs.name, cls: "item",
    html: r => (r.rs.settle ? `<span class="tag settle">정산</span>` : "") +
               (r.rs.num ? `<span class="pnum" title="${esc(r.rs.cat || "")}">${r.rs.num}</span>` : "") +
               `${esc(r.rs.name)}${r.rs.split ? `<span class="tag split">번호분리</span>` : ""}` +
               briefHTML(r) },
  { k: "price", label: "입찰가 (차액)", get: r => +r.price || 0, cls: "money price",
    html: r => (r.price ? won(r.price) : `<span style="color:var(--sub)">미기재</span>`) +
      (r.edited ? `<span class="tag edited">수정</span>` : "") +
      (r.rs.ask && r.price
        ? ` <span class="diff ${r.diff >= 0 ? "up" : "dn"}">${r.diff >= 0 ? "+" : "−"}${Number(Math.abs(r.diff)).toLocaleString()}</span>`
        : "") +
      (r.isTop && r.competing ? `<span class="tag top">최고가</span>` : "") },
  { k: "qty",   label: "수량",    get: r => r.qty || 1, cls: "num",
    html: r => (r.qty || 1) > 1 ? `<b>${r.qty}개</b>` : "1개" },
  { k: "rank",  label: "순위",     get: r => r.rank, cls: "num",
    html: r => r.rank ? `${r.rank}${r.rank === 1 ? `<span class="tag r1">최선착</span>` : ""}` : "—" },
  { k: "who",   label: "입찰자",   get: r => r.name },
  { k: "contact", label: "연락처", get: r => r.contact,
    html: r => `${esc(fmtContact(r.contact))} <button class="bcontact" data-uid="${esc(r.uid)}" title="문자 양식 열기 (연락함으로 표시)">✉</button>` },
  { k: "msg",   label: "메모",     get: r => r.message, cls: "msg",
    html: r => r.message
      ? `<span class="msgtxt" title="${esc(r.message)}">${esc(r.message)}</span>` : "" },
  { k: "ts",    label: "접수",     get: r => r.ts, cls: "ts",
    html: r => {
      const [d, ...t] = String(r.ts || "").split(" ");
      return d ? `<span class="tstxt" title="${esc(r.ts)}"><span class="tsd">${esc(d)}</span>` +
                 `<span class="tst">${esc(t.join(" "))}</span></span>` : "";
    } },
  { k: "state", label: "상태",     get: r => STATE_ORDER[stateOf(r)] ?? 9, cls: "state",
    html: r => {
      /* 연락함·진행중(자동)은 현재 상태를 보여주고 "미처리로" 되돌림 옵션을 붙인다 —
         실수로 ✉ 를 눌렀거나 메모 자동 승격을 취소할 길이 있어야 한다 */
      const s = stateOf(r), auto = s === "contact" || s === "prog";
      const opts = auto
        ? [[s, STATE_LABEL[s]], ["bid", "입찰 (미처리로)"], ["done", "거래완료"], ["drop", "취소"]]
        : Object.entries(SEL_STATE_LABEL);
      const v0 = auto ? s : selState(s);
      return `<select class="stsel ${s}" data-uid="${esc(r.uid)}">` +
        opts.map(([k, v]) =>
          `<option value="${k}" ${v0 === k ? "selected" : ""}>${v}</option>`).join("") + `</select>`;
    } },
  { k: "act",   label: "수정", get: () => "", cls: "act",
    html: r => PREVIEW ? "" :
      `<button class="bedit" data-uid="${esc(r.uid)}" title="이 입찰 고치기">✎</button>` },
  { k: "note",  label: "내 메모 (거래)", get: r => noteOf(r), cls: "note",
    html: r => {
      const v = noteOf(r);
      return v ? `<span class="notetxt">${esc(v)}</span><button class="noteedit" title="고치기">✎</button>`
               : `<span class="noteadd">+ 메모</span>`;
    } },
];

// 열 순서 (뒤쪽): 메모 > 내 메모 > 상태 > 접수 > 수정
{
  const ORDER = ["item","price","qty","rank","who","contact","msg","note","state","ts","act"];
  COLS.sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
}

/* 표에 뿌릴 행 만들기 (순위·최고가·차액 계산 + 수정값 반영) */
let ROWMAP = new Map();
function buildRows() {
  const map = group(BIDS);
  const rows = [];
  ROWMAP = new Map();
  map.forEach(list => {
    list.forEach(b => {
      b.rs = b.resolved;
      b.uid = b.resolved.key + "|" + b.name + "|" + b.row;
      if (b.rawPrice === undefined) b.rawPrice = b.price;   // 원본 보존
      b.price = priceOf(b);
      b.edited = b.price !== b.rawPrice;
    });
    const max = Math.max(...list.map(b => +b.price || 0));
    list.forEach(b => {
      b.isTop = (+b.price || 0) === max && max > 0;
      b.competing = list.length > 1;
      b.diff = (+b.price || 0) - (b.rs.ask || 0);
      ROWMAP.set(b.uid, b);
      rows.push(b);
    });
  });
  return rows;
}

function filtered(rows) {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const cat = document.getElementById("cat").value;
  const who = document.getElementById("who").value;
  const st = document.getElementById("state").value;
  return rows.filter(r =>
    (!cat || r.rs.catKey === cat) &&
    (!who || r.name === who) &&
    (!st || (st === "active" ? !["done", "drop"].includes(stateOf(r)) : stateOf(r) === st)) &&
    (!q || (r.rs.name + " " + r.item + " " + r.name + " " + r.contact + " " + r.rs.cat)
      .toLowerCase().includes(q)));
}

function fillSelects(rows) {
  const cs = document.getElementById("cat"), ws = document.getElementById("who");
  /* 매번 다시 채운다. 예전에는 최초 1회만 채워서 새 입찰자가 목록에 안 나왔고,
     덧붙이기만 해서 다시 채울 때마다 항목이 한 벌씩 늘어났다.
     고르고 있던 값은 유지한다. */
  const keepC = cs.value, keepW = ws.value;
  cs.length = 1; ws.length = 1;
  const cats = [...new Set(rows.map(r => r.rs.catKey))].filter(Boolean);
  cats.forEach(c => cs.insertAdjacentHTML("beforeend", `<option value="${c}">${esc(CATS[c] || c)}</option>`));
  /* 입찰자 목록엔 진행중(완료·취소 제외) 입찰이 있는 사람만 */
  [...new Set(rows.filter(r => !["done", "drop"].includes(stateOf(r))).map(r => r.name))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"))
    .forEach(n => ws.insertAdjacentHTML("beforeend", `<option value="${esc(n)}">${esc(n)}</option>`));
  cs.value = keepC; ws.value = keepW;      // 고르던 필터 복원
}

/* 표가 비었을 때: 필터 때문인지, 시트를 못 읽은 것인지 화면에 밝힌다.
   (예전에는 숨겨진 영역에 안내를 그려서 원인이 전혀 안 보였다)            */
function emptyGridHTML() {
  const isFiltered = document.getElementById("q").value.trim() ||
    document.getElementById("cat").value || document.getElementById("who").value ||
    document.getElementById("state").value;

  if (BIDS.length && isFiltered)
    return `<div class="empty">조건에 맞는 입찰이 없어요.<br>
      <span style="font-size:13px">검색어·필터를 지우면 전체 ${BIDS.length}건이 보여요.</span></div>`;

  if (BIDS.length) return `<div class="empty">조건에 맞는 입찰이 없어요.</div>`;

  if (PREVIEW) return `<div class="empty">표시할 품목이 없어요.</div>`;

  const info = TRIED.length
    ? TRIED.map(t => `· <b>${esc(t.name)}</b> — ${t.rows}행 중 입찰로 인식된 것 ${t.bids}건`).join("<br>")
    : "읽을 수 있는 후보 시트가 없었어요.";
  const all = (DATA && DATA.sheets || []).map(s => `${esc(s.sheet)}(${(s.rows||[]).length}행)`).join(" · ") || "-";

  // 원인 파악에 꼭 필요한 것: 실제 헤더와, 어느 열을 무엇으로 인식했는지
  const bid = (DATA && DATA.sheets || []).find(s => String(s.sheet).trim() === "입찰");
  const heads = bid ? esc(JSON.stringify(bid.headers)) : "-";
  const row1 = bid && (bid.rows || [])[0] ? esc(JSON.stringify(bid.rows[0])) : "-";
  const colmap = LAST_COLMAP ? esc(JSON.stringify(LAST_COLMAP)) : "-";

  return `<div class="empty" style="text-align:left;max-width:620px;margin:0 auto;padding:26px 4px">
    <b style="display:block;font-size:15px;color:var(--ink);margin-bottom:8px">입찰을 하나도 읽지 못했어요.</b>
    <div style="font-size:13px;line-height:1.7">
      시도한 시트<br>${info}
      <div style="margin-top:10px;color:var(--sub)">시트 전체: ${all}</div>
      <div style="margin-top:12px;padding:10px;background:#f3f3f1;border-radius:8px;
                  font-family:ui-monospace,monospace;font-size:11.5px;word-break:break-all">
        헤더: ${heads}<br><br>첫 행: ${row1}<br><br>열 인식: ${colmap}
        ${COLMAP_NOTE ? `<br><br>${esc(COLMAP_NOTE)}` : ""}
      </div>
      <div style="margin-top:10px;color:var(--sub)">이 내용을 알려주시면 원인을 바로 잡을 수 있어요.</div>
    </div></div>`;
}

function renderGrid() {
  closeNotePop();          // 표를 새로 그리면 떠 있던 메모 카드는 닫는다
  const all = buildRows();
  BRIEF = makeBrief(all);  // 필터와 무관하게 품목 전체 현황을 요약한다
  fillSelects(all);
  let rows = filtered(all);

  const c = COLS.find(x => x.k === SORT.col) || COLS[0];
  rows.sort((a, b) => {
    const va = c.get(a), vb = c.get(b);
    let d = typeof va === "number" && typeof vb === "number"
      ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""), "ko");
    if (!d && c.k === "cat") d = (a.rs.num || 0) - (b.rs.num || 0);
    return d * SORT.dir;
  });

  const grouping = document.getElementById("group").value;
  const head = `<thead><tr><th class="cbx"><input type="checkbox" id="cbAll"></th>` +
    COLS.map(x => `<th class="${(x.cls || "").includes("hide-m") ? "hide-m" : ""}" ${x.k === "act" ? "" : `data-k="${x.k}"`}>${x.label}${SORT.col === x.k ? `<span class="arw">${SORT.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("") +
    `</tr></thead>`;

  const tr = r => `<tr data-uid="${esc(r.uid)}" class="st-${stateOf(r)} ${r.rs.settle ? "settle-row" : ""} ${SEL.has(r.uid) ? "sel" : ""}">` +
    `<td class="cbx"><input type="checkbox" class="cb" ${SEL.has(r.uid) ? "checked" : ""}></td>` +
    COLS.map(x => `<td class="${x.cls || ""}" data-uid="${esc(r.uid)}" data-k="${x.k}">` +
      `${x.html ? x.html(r) : esc(x.get(r) ?? "")}</td>`).join("") + `</tr>`;

  let body = "";
  if (grouping === "none") {
    body = rows.map(tr).join("");
  } else {
    const key = r => grouping === "bidder" ? r.name : r.rs.cat + " " + r.rs.num + " " + r.rs.name;
    const groups = new Map();
    rows.forEach(r => { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    groups.forEach((list, k) => {
      const sum = list.reduce((s, r) => s + (+r.price || 0), 0);
      const gnote = grouping === "bidder" ? noteOf(list[0]) : "";
      body += `<tr class="grouphead"><td colspan="${COLS.length + 1}">${esc(k)} · ${list.length}건` +
        (gnote ? ` <span class="gnote">📌 ${esc(gnote)}</span>` : "") +
        `<span class="gsum">합계 ${won(sum) || "₩0"}</span></td></tr>` + list.map(tr).join("");
    });
  }

  // 다시 그리면 스크롤이 처음으로 돌아가므로 위치를 기억했다 복원한다
  const oldWrap = document.querySelector(".gridwrap");
  const keep = oldWrap ? { x: oldWrap.scrollLeft, y: oldWrap.scrollTop } : null;

  document.getElementById("grid").innerHTML = rows.length
    ? `<div class="gridwrap"><table class="grid">${head}<tbody>${body}</tbody></table></div>`
    : emptyGridHTML();

  const newWrap = document.querySelector(".gridwrap");
  if (keep && newWrap) { newWrap.scrollLeft = keep.x; newWrap.scrollTop = keep.y; }

  document.querySelectorAll("table.grid thead th[data-k]").forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      SORT = { col: k, dir: SORT.col === k ? -SORT.dir : 1 };
      renderGrid();
    };
  });
  // 메모 카드는 바깥을 누르거나 표를 스크롤하면 닫힘
  if (!window.__notepopBound) {
    window.__notepopBound = true;
    document.addEventListener("click", e => { if (!e.target.closest("td.note, td.msg, td.price, td.item, #notepop")) closeNotePop(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeNotePop(); });
    window.addEventListener("scroll", closeNotePop, true);
  }
  const all2 = document.getElementById("cbAll");
  if (all2) all2.onclick = () => {
    rows.forEach(r => all2.checked ? SEL.add(r.uid) : SEL.delete(r.uid));
    renderGrid(); updateSelBar(all);
  };
  applySticky();

  document.querySelectorAll("table.grid td.ts").forEach(td => {
    td.onclick = () => td.classList.toggle("open");
  });
  document.querySelectorAll("table.grid td.msg").forEach(td => {
    td.onclick = () => {
      const txt = td.querySelector(".msgtxt");
      if (!txt || !txt.textContent.trim()) return;
      const was = td.classList.contains("open");
      closeNotePop();
      if (!was) openNotePop(td, txt.textContent);
    };
  });

  // 품목 칸 탭 → 이름 펼침 + 그 품목의 거래 현황 팝업 (누구랑 몇 개 진행중인지)
  document.querySelectorAll("table.grid td.item").forEach(td => {
    td.onclick = () => {
      const was = td.classList.contains("open");
      closeNotePop();
      if (was) return;
      td.classList.add("open");
      const row = ROWMAP.get(td.dataset.uid);
      if (row) openNotePop(td, itemPopText(row.rs.key));
    };
  });

  // 입찰 고치기 / 삭제
  /* 연락하기 — 문자 양식을 만들어 열고(모바일) 또는 복사하고(PC/카톡), 미처리 건을 '연락함'으로 */
  document.querySelectorAll("button.bcontact").forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      const r = ROWMAP.get(b.dataset.uid);
      if (!r) return;
      const mine = [...ROWMAP.values()].filter(x => x.name === r.name && x.contact === r.contact && stateOf(x) !== "drop");
      const first = (mine[0] || r).rs.name, extra = Math.max(0, mine.length - 1);
      const msg = `안녕하세요, ${r.name}님.\n장비 구매 신청하신 스튜디오 루나블루입니다.\n신청해주신 ${first}${extra ? ` 외 ${extra}건` : ""} 확인하고 연락드립니다.`;
      const d = String(r.contact || "").replace(/[^\d]/g, "");
      const phone = /^1\d{9}$/.test(d) ? "0" + d : (/^01\d{8,9}$/.test(d) ? d : null);
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const android = /Android/i.test(navigator.userAgent);
      const mac = !ios && /Mac/i.test(navigator.userAgent);   // 맥은 메시지 앱이 sms: 를 받는다
      if (phone && (ios || android || mac)) {
        // 맥 메시지 앱은 본문(body)을 무시하는 버전이 있어 클립보드에도 같이 넣어둔다
        try { await navigator.clipboard.writeText(msg); } catch { /* 무시 */ }
        location.href = "sms:" + phone + (android ? "?" : "&") + "body=" + encodeURIComponent(msg);
        if (mac) syncFlag(`메시지 앱 열림 · 본문이 안 채워지면 붙여넣기 (복사해뒀어요)`, "ok");
      } else {
        try {
          await navigator.clipboard.writeText(msg);
          syncFlag(phone ? `양식 복사됨 — 문자로 붙여넣기 (${fmtContact(r.contact)})` : "양식 복사됨 — 카톡에 붙여넣기", "ok");
        } catch { prompt("복사해서 보내세요", msg); }
      }
      mine.filter(x => stateOf(x) === "bid")
        .forEach(x => { setOV(x.uid, { state: "contact" }); pushOverride("state", x.uid, "contact", `${x.name} 연락함`); });
      renderGrid(); renderStats();
    };
  });
  document.querySelectorAll("button.bedit").forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const r = ROWMAP.get(b.dataset.uid);
      if (r) openBidModal(r.row);
    };
  });

  // 내 메모 (입찰자 단위) — 칸 클릭해서 바로 입력
  document.querySelectorAll("table.grid td.note").forEach(td => {
    td.onclick = e => {
      if (td.querySelector("input")) return;
      // 메모 글자를 누르면 펼침/접기, ✎ 를 눌러야 편집 (구매자 메모와 같은 방식)
      if (e.target.classList.contains("notetxt")) {
        const was = td.classList.contains("open");
        closeNotePop();
        if (!was) openNotePop(td, e.target.textContent);
        return;
      }
      const row = ROWMAP.get(td.dataset.uid);
      if (!row) return;
      const k = noteKey(row);
      td.innerHTML = `<input class="nedit" value="${esc(NOTES[k] || "")}" placeholder="만날 시간·장소·거래 방법">`;
      const inp = td.querySelector("input");
      inp.focus();
      let closed = false;
      const commit = () => {
        if (closed) return; closed = true;
        const v = inp.value.trim();
        setNote(k, v);
        /* 메모를 적었다 = 연락해서 내용이 오갔다. 그 사람의 미처리·연락함 건을 진행중으로 올린다 */
        if (v) [...ROWMAP.values()]
          .filter(b => noteKey(b) === k && ["bid", "contact"].includes(stateOf(b)))
          .forEach(b => { setOV(b.uid, { state: "prog" }); pushOverride("state", b.uid, "prog", `${b.name} 진행중`); });
        renderGrid(); renderStats();
        pushOverride("note", k, v, `${row.name} 메모`);
      };
      inp.onblur = commit;
      inp.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { closed = true; renderGrid(); }
      };
    };
  });

  // 상태 바꾸기 → 로컬 저장 후 시트에도 반영(구매페이지 실시간 연동)
  document.querySelectorAll("select.stsel").forEach(sel => {
    sel.onchange = async () => {
      const uid = sel.dataset.uid, row = ROWMAP.get(uid);
      if (sel.value === "drop") {          // 취소는 확인을 거쳐야 하므로 따로 처리
        if (!row) return;
        sel.value = selState(stateOf(row));   // 확인창을 접으면 원래 상태로 되돌림
        await cancelBid(row);
        return;
      }
      if (!row) return;
      const it = ITEMS.find(x => x.sku === row.rs.sku) || {};
      const total = it.qty || 1;
      let remain = null;
      if (sel.value === "done" && total > 1) {
        const cur = it.remain != null ? it.remain : total;
        const ans = prompt(`${row.rs.name}\n\n지금 ${cur}개 남아 있어요. 몇 개 파셨나요?\n(전부면 ${cur} 입력)`, String(cur));
        if (ans === null) { sel.value = selState(stateOf(row)); return; }   // 취소하면 상태를 되돌린다
        const sold = Math.max(0, Math.min(cur, parseInt(ans, 10) || 0));
        remain = cur - sold;
        it.remain = remain;
      }
      const next = remain != null && remain > 0 ? "bid" : sel.value;
      setOV(uid, { state: next });
      renderGrid(); renderStats();
      /* 상태는 입찰 한 건 단위로 시트에 남겨야 한다.
         'bid' 도 이제 명시적으로 저장한다 — 미처리로 되돌린 건이 다른 기기에서
         메모 자동 승격(promoteNoted)으로 다시 진행중이 되지 않게 하기 위해서다. */
      pushOverride("state", uid, next,
        `${row.name} ${next === "bid" ? "미처리로 되돌림" : (STATE_LABEL[next] || next)}`);
      pushStatus(row.rs.name,
        sel.value === "done" && (remain == null || remain === 0) ? "sold" : "sale",
        { sku: row.rs.sku, remain, skip: row.rs.settle || row.rs.matched === false });
    };
    sel.onclick = e => e.stopPropagation();
  });

  // 연락처 칸 아무 데나 눌러도 ✉ 와 같게
  document.querySelectorAll("table.grid td[data-k='contact']").forEach(td => {
    td.onclick = e => {
      const b = td.querySelector(".bcontact");
      if (b && !e.target.closest(".bcontact")) b.click();
    };
  });

  // 입찰가 수정: 칸 클릭 → 입력창 + 원래 희망가 힌트, Enter/포커스아웃 저장, Esc 취소
  document.querySelectorAll("table.grid td.price").forEach(td => {
    td.onclick = () => {
      if (td.querySelector("input")) return;
      const uid = td.dataset.uid, row = ROWMAP.get(uid);
      if (!row) return;
      td.innerHTML = `<input class="pedit" value="${esc(row.price || "")}" inputmode="numeric" placeholder="${row.rs.ask || ""}">`;
      openNotePop(td, `희망가 ${row.rs.ask
        ? won(row.rs.ask) + (row.rs.askUnit ? `/${row.rs.askUnit}` : "")
        : "미정"} · Enter 저장 · Esc 취소`);
      const inp = td.querySelector("input");
      inp.focus(); inp.select();
      let closed = false;
      const commit = () => {
        if (closed) return; closed = true;
        const v = inp.value.replace(/[^\d]/g, "");
        setOV(uid, { price: v === "" ? null : v });
        renderGrid(); renderStats();
        pushOverride("price", uid, v, `${row.rs.name} / ${row.name} 금액`);
      };
      inp.onblur = commit;
      inp.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { closed = true; renderGrid(); }
      };
    };
  });
  // 수량 수정: 칸 클릭 → 입력창 (입찰가와 같은 방식, 시트 H열에 저장)
  document.querySelectorAll("table.grid td[data-k='qty']").forEach(td => {
    td.onclick = () => {
      if (PREVIEW || td.querySelector("input")) return;
      const row = ROWMAP.get(td.dataset.uid);
      if (!row) return;
      td.innerHTML = `<input class="pedit" style="width:40px" value="${row.qty || 1}" inputmode="numeric">`;
      const inp = td.querySelector("input");
      inp.focus(); inp.select();
      let closed = false;
      const commit = async () => {
        if (closed) return; closed = true;
        const q = Math.max(1, Math.min(99, parseInt(inp.value, 10) || 1));
        if (q === (row.qty || 1)) { renderGrid(); return; }
        row.qty = q;
        renderGrid(); renderStats();
        try {
          const pw = adminPw();
          if (!pw) { syncFlag("시트 미저장 (비밀번호 없음) — 새로고침하면 되돌아가요", "err"); return; }
          await callSheet({ action: "editBid", pw, op: "update", row: row.row,
            bid: { ts: row.ts, name: row.name, contact: row.contact, item: row.item,
                   price: row.rawPrice ?? row.price, message: row.message, qty: q },
            expect: { name: row.name, item: row.item } });
          syncFlag(`수량 저장됨 · ${row.rs.name} ${q}개`, "ok");
        } catch (e) { syncFlag("수량 저장 실패: " + e.message, "err"); }
      };
      inp.onblur = commit;
      inp.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { closed = true; renderGrid(); }
      };
    };
  });

  document.querySelectorAll("table.grid tbody tr[data-uid]").forEach(row => {
    row.querySelector(".cb").onclick = e => {
      e.stopPropagation();
      const u = row.dataset.uid;
      SEL.has(u) ? SEL.delete(u) : SEL.add(u);
      row.classList.toggle("sel");
      updateSelBar(all);
    };
  });
  updateSelBar(all);
}

/* 체크박스·카테고리·번호·품목 열을 왼쪽에 고정 (좌우 스크롤해도 품목이 보이게) */
function applySticky() {
  const table = document.querySelector("table.grid");
  if (!table) return;
  const headRow = table.querySelector("thead tr");
  if (!headRow) return;
  const idxs = [0].concat(["item"]
    .map(k => headRow.querySelector(`th[data-k="${k}"]`))
    .filter(Boolean).map(th => th.cellIndex));

  const rows = [...table.rows].filter(r => !r.classList.contains("grouphead"));
  let left = 0;
  idxs.forEach(i => {
    const w = headRow.cells[i].getBoundingClientRect().width;
    rows.forEach(r => {
      const c = r.cells[i];
      if (!c) return;
      c.classList.add("stick");
      c.style.left = left + "px";
    });
    left += w;
  });
  // 마지막 고정 열(품목)에 경계선
  rows.forEach(r => { const c = r.cells[idxs[idxs.length - 1]]; if (c) c.classList.add("stick-last"); });
  // 그룹 헤더는 가로로 붙어다니게
  table.querySelectorAll("tr.grouphead td").forEach(td => { td.style.left = "0px"; });
}

/* 선택한 입찰 일괄 상태 변경 (미처리·완료·취소) — 확인 한 번으로 전부 처리 */
async function bulkApply(next, picked) {
  const label = { bid: "미처리로 되돌림", done: "거래완료", drop: "취소" }[next];
  const todo = picked.filter(r => selState(stateOf(r)) !== next || (next === "bid" && stateOf(r) !== "bid"));
  if (!todo.length) { syncFlag(`선택한 건이 이미 전부 그 상태예요`, ""); return; }
  const multiQty = next === "done"
    ? [...new Set(todo.filter(r => ((ITEMS.find(x => x.sku === r.rs.sku) || {}).qty || 1) > 1).map(r => r.rs.name))]
    : [];
  if (!confirm(`선택 ${todo.length}건을 ${label} 처리할까요?` +
    (next === "drop" ? "\n(목록에는 취소 기록으로 남습니다)" : "") +
    (multiQty.length ? `\n\n수량이 여러 개인 품목은 입찰서의 수량만큼만 차감되고 나머지는 판매중으로 남아요:\n· ${multiQty.join("\n· ")}` : ""))) return;

  for (const r of todo) {
    setOV(r.uid, { state: next });
    await pushOverride("state", r.uid, next, `${r.name} ${label}`);
  }
  /* 구매페이지 반영 — 품목 단위로 한 번씩 */
  const items = new Map();
  todo.forEach(r => items.set(r.rs.sku || r.rs.name, r));
  for (const r of items.values()) {
    const skip = r.rs.settle || r.rs.matched === false;
    const it = ITEMS.find(x => x.sku === r.rs.sku) || {};
    const fullQty = it.qty || null;
    if (next === "done") {
      /* 입찰서의 수량만큼만 차감 — 2개 중 1개 거래면 1개는 판매중으로 남는다.
         예전엔 무조건 전량 판매완료로 밀어서 남은 재고가 사라져 보였다. */
      const total = it.qty || 1;
      const soldQ = todo.filter(o => o.rs.key === r.rs.key).reduce((s2, o) => s2 + (o.qty || 1), 0);
      const cur = it.remain != null ? it.remain : total;
      const remain = Math.max(0, cur - soldQ);
      if (total > 1) it.remain = remain;
      await pushStatus(r.rs.name, remain === 0 ? "sold" : "sale",
        { sku: r.rs.sku, remain: total > 1 ? remain : null, skip });
    } else if (next === "bid") {
      /* 완료였던 걸 미처리로 되돌리면 판매중 복원 — 단, 같은 품목에 아직 완료 입찰이 남아 있으면 그대로 */
      const wasSold = SHEET_SOLD_SKU.has(r.rs.sku) || SHEET_SOLD.has(r.rs.name) || r.rs.status === "sold";
      const hasDone = [...ROWMAP.values()].some(o => o.rs.name === r.rs.name && stateOf(o) === "done");
      if (wasSold && !hasDone) await pushStatus(r.rs.name, "sale", { sku: r.rs.sku, remain: fullQty, skip });
    } else {
      const others = [...ROWMAP.values()]
        .filter(o => o.rs.name === r.rs.name && stateOf(o) !== "drop" && !isDropped(o));
      if (!others.length) await pushStatus(r.rs.name, "sale", { sku: r.rs.sku, remain: fullQty, skip });
    }
  }
  SEL.clear();
  renderGrid(); renderStats();
  syncFlag(`${todo.length}건 ${label} 처리됨`, "ok");
}

function updateSelBar(all) {
  const bar = document.getElementById("selbar");
  const picked = all.filter(r => SEL.has(r.uid));
  const ss = document.getElementById("selstate");
  ss.value = "";
  ss.onchange = () => { const v = ss.value; ss.value = ""; if (v) bulkApply(v, picked); };
  if (!picked.length) { bar.classList.add("hide"); document.body.style.paddingBottom = "60px"; return; }
  const sum = picked.filter((r,i,a)=>a.findIndex(x=>x.row===r.row&&x.name===r.name&&x.contact===r.contact)===i).reduce((s, r) => s + (+r.price || 0), 0);
  const askSum = picked.filter((r,i,a)=>a.findIndex(x=>x.rs.key===r.rs.key)===i).reduce((s, r) => s + (r.rs.ask || 0), 0);
  const people = new Set(picked.map(r => r.name));
  bar.classList.remove("hide");
  document.body.style.paddingBottom = "76px";
  document.getElementById("selinfo").innerHTML =
    `선택 <b>${picked.length}</b>건 · 입찰자 ${people.size}명 · 입찰 합계 <b>${won(sum) || "₩0"}</b>` +
    (askSum ? ` <span style="opacity:.7">(희망가 합계 ${won(askSum)})</span>` : "");
  document.getElementById("selcopy").onclick = () => {
    const txt = picked.map(r =>
      `[${r.rs.cat} ${r.rs.num}] ${r.rs.name}\t${r.name}\t${r.price ? Number(r.price).toLocaleString() + "원" : "미기재"}`).join("\n")
      + `\n합계\t${sum.toLocaleString()}원`;
    navigator.clipboard.writeText(txt).then(
      () => { const b = document.getElementById("selcopy"); b.textContent = "복사됨"; setTimeout(() => b.textContent = "선택 내역 복사", 1200); },
      () => alert("복사 실패"));
  };
}

function render() {
  renderStats();
  if (VIEW === "grid") { renderGrid(); return; }
  renderCards();
}

function renderStats() {
  const map = group(BIDS);
  const unmatched = [...map.values()].filter(l => !l[0].resolved.matched).length;
  document.getElementById("stats").innerHTML = PREVIEW
    ? `<div class="stat"><b>${map.size}</b>예약된 품목</div>` +
      `<div class="stat"><b>${map.size - unmatched}</b>현재 품목과 매칭됨</div>` +
      (unmatched ? `<div class="stat"><b>${unmatched}</b>미매칭</div>` : "") +
      `<div class="stat"><b>—</b>입찰자 (비공개)</div>`
    : (() => {
        const rows = buildRows();
        /* 같은 입찰이 동명이품 수만큼 여러 행으로 나뉘므로, 센 것을 또 세지 않는다 */
        const uniq = (list) => {
          const seen = new Set(), out = [];
          list.forEach(r => {
            const k = r.row + "|" + r.name + "|" + r.contact;
            if (seen.has(k)) return;
            seen.add(k); out.push(r);
          });
          return out;
        };
        const n = s => uniq(rows.filter(r => stateOf(r) === s)).length;
        const doneSum = uniq(rows.filter(r => stateOf(r) === "done")).reduce((s, r) => s + (+r.price || 0), 0);
        const bidCount = uniq(rows).length;
        /* 예상 수령: 아직 완료 안 된 품목마다 1순위 입찰 하나만 더한다.
           경쟁 입찰을 다 더하면 부풀려지고, 완료 품목은 거래완료 합계에 이미 있다.
           같은 입찰이 동명이품으로 나뉜 건 uniq 와 같은 키로 1번만 센다. */
        const byItem = new Map();
        rows.forEach(r => {
          if (stateOf(r) === "drop") return;
          if (!byItem.has(r.rs.key)) byItem.set(r.rs.key, []);
          byItem.get(r.rs.key).push(r);
        });
        const seenTop = new Set();
        let expSum = 0;
        byItem.forEach(list => {
          if (list.some(r => stateOf(r) === "done")) return;
          const top = list.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];
          const k = top.row + "|" + top.name + "|" + top.contact;
          if (seenTop.has(k)) return;
          seenTop.add(k);
          expSum += +top.price || 0;
        });
        return `<div class="stat"><b>${map.size}</b>입찰된 품목</div>` +
          `<div class="stat"><b>${bidCount}</b>총 입찰 건수</div>` +
          `<div class="stat"><b>${new Set(BIDS.map(b => b.name + "|" + b.contact)).size}</b>입찰자 수</div>` +
          `<div class="stat"><b>${[...map.values()].filter(l => l.length > 1).length}</b>경쟁 품목</div>` +
          `<div class="stat warn"><b>${n("bid")}</b>미처리</div>` +
          `<div class="stat"><b>${n("contact") + n("prog")}</b>연락·진행중</div>` +
          `<div class="stat"><b>${n("done")}</b>거래완료 <small>${won(doneSum) || "₩0"}</small></div>` +
          `<div class="stat"><b>${won(expSum) || "₩0"}</b>예상 수령 <small>품목별 1순위만</small></div>`;
      })();
}

function renderCards() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const sortBy = document.getElementById("sort").value;
  const map = group(BIDS);

  /* 카드 보기에도 상태 필터 적용 — 기본은 완료·취소 숨김 (표와 동일) */
  const st = PREVIEW ? "" : document.getElementById("state").value;
  const stOK = b => !st || (st === "active" ? !["done", "drop"].includes(stateOf(b)) : stateOf(b) === st);
  let groups = [...map.entries()]
    .map(([key, list]) => ({ key, list: list.filter(stOK) }))
    .filter(g => g.list.length)
    .map(({ key, list }) => ({
      key, list, rs: list[0].resolved,
      item: list[0].resolved.name,
      max: Math.max(...list.map(b => +b.price || 0)),
      last: Math.max(...list.map(b => Date.parse(b.ts) || b.row)),
    }));

  if (q) groups = groups.filter(g =>
    (g.item + " " + g.list[0].item + " " + (g.rs.cat || "")).toLowerCase().includes(q) ||
    g.list.some(b => (b.name + " " + b.contact).toLowerCase().includes(q)));

  groups.sort((a, b) =>
    sortBy === "bids"  ? b.list.length - a.list.length :
    sortBy === "price" ? b.max - a.max :
    sortBy === "name"  ? (a.rs.cat || "힣").localeCompare(b.rs.cat || "힣", "ko")
                         || (a.rs.num || 999) - (b.rs.num || 999) :
                         b.last - a.last);

  const head = g => `
    <div class="item-head">
      <div class="item-name">
        ${g.rs.matched
          ? `<span class="pnum">${esc(g.rs.cat)} ${g.rs.num}</span>`
          : `<span class="pnum warn">미매칭</span>`}
        ${esc(g.item)}
        ${g.rs.split ? `<span class="pnum dup">같은 이름 여러 개 · 번호별로 나눔</span>` : ""}
        ${g.rs.matched && g.list[0].item !== g.item
          ? `<div class="was">시트 표기: ${esc(g.list[0].item)}</div>` : ""}
      </div>
      <div class="item-meta">${PREVIEW ? "예약중" : g.list.length + "건" + (g.list.length > 1 ? " · 경쟁" : "")}</div>
    </div>`;

  if (PREVIEW) {
    document.getElementById("list").innerHTML = groups.length
      ? groups.map(g => `<div class="item">${head(g)}</div>`).join("")
      : `<div class="empty">표시할 품목이 없어요.</div>`;
    return;
  }

  document.getElementById("list").innerHTML = groups.length ? groups.map(g => `
    <div class="item">
      ${head(g)}
      ${g.list.map(b => `
        <div class="bid">
          <div class="rank r${b.rank <= 3 ? b.rank : ""}">${b.rank}</div>
          <div>
            <div class="who">${esc(b.name || "(이름 없음)")}<span class="contact">${esc(fmtContact(b.contact))}</span>${b.dupes ? `<span class="contact">중복 ${b.dupes}건 합침</span>` : ""}</div>
            <div class="when">${esc(b.ts || "시각 미기록")}</div>
            ${b.message ? `<div class="msg">${esc(b.message)}</div>` : ""}
          </div>
          <div class="price ${b.price ? "" : "none"}">${b.price ? won(b.price) : "금액 미기재"}</div>
        </div>`).join("")}
    </div>`).join("") : `<div class="empty">표시할 입찰이 없어요.</div>`;
}

function renderRaw() {
  document.getElementById("raw").innerHTML = (DATA.sheets || []).map(sh => `
    <h4 style="margin:14px 0 6px;font-size:13.5px">${esc(sh.sheet)} (${(sh.rows || []).length}행)</h4>
    <table>
      <tr>${(sh.headers || []).map(h => `<th>${esc(h)}</th>`).join("")}</tr>
      ${(sh.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c == null ? "" : c)}</td>`).join("")}</tr>`).join("")}
    </table>`).join("");
}
