const COLS = [
  { k: "item",  label: "품목",     get: r => r.rs.name, cls: "item",
    html: r => (r.rs.settle ? `<span class="tag settle">정산</span>` : "") +
               `${esc(r.rs.name)}${r.rs.split ? `<span class="tag split">번호분리</span>` : ""}` },
  { k: "cat",   label: "카테고리", get: r => r.rs.cat, cls: "hide-m" },
  { k: "num",   label: "번호",     get: r => r.rs.num, cls: "num hide-m" },
  { k: "ask",   label: "희망가",   get: r => r.rs.ask, cls: "money",
    html: r => r.rs.ask ? won(r.rs.ask) + (r.rs.askUnit ? `<small>/${esc(r.rs.askUnit)}</small>` : "") : "—" },
  { k: "price", label: "입찰가 (차액)", get: r => +r.price || 0, cls: "money price",
    html: r => (r.price ? won(r.price) : `<span style="color:var(--sub)">미기재</span>`) +
      (r.edited ? `<span class="tag edited">수정</span>` : "") +
      (r.rs.ask && r.price
        ? ` <span class="diff ${r.diff >= 0 ? "up" : "dn"}">${r.diff >= 0 ? "+" : "−"}${Number(Math.abs(r.diff)).toLocaleString()}</span>`
        : "") +
      (r.isTop && r.competing ? `<span class="tag top">최고가</span>` : "") },
  { k: "rank",  label: "순위",     get: r => r.rank, cls: "num",
    html: r => r.rank ? `${r.rank}${r.rank === 1 ? `<span class="tag r1">최선착</span>` : ""}` : "—" },
  { k: "who",   label: "입찰자",   get: r => r.name },
  { k: "contact", label: "연락처", get: r => r.contact, html: r => esc(fmtContact(r.contact)) },
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
      const s = stateOf(r);
      return `<select class="stsel ${s}" data-uid="${esc(r.uid)}">` +
        Object.entries(STATE_LABEL).map(([k, v]) =>
          `<option value="${k}" ${s === k ? "selected" : ""}>${v}</option>`).join("") + `</select>`;
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
  const ORDER = ["item","cat","num","ask","price","rank","who","contact","msg","note","state","ts","act"];
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
    (!st || stateOf(r) === st) &&
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
  [...new Set(rows.map(r => r.name))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"))
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
    document.addEventListener("click", e => { if (!e.target.closest("td.note, td.msg, #notepop")) closeNotePop(); });
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

  // 모바일에서 좁게 줄인 품목 칸 — 누르면 전체 이름 표시
  document.querySelectorAll("table.grid td.item").forEach(td => {
    td.onclick = () => td.classList.toggle("open");
  });

  // 입찰 고치기 / 삭제
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
        renderGrid();
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
        sel.value = stateOf(row);          // 확인창을 접으면 원래 상태로 되돌림
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
        if (ans === null) { sel.value = stateOf(row); return; }     // 취소하면 상태를 되돌린다
        const sold = Math.max(0, Math.min(cur, parseInt(ans, 10) || 0));
        remain = cur - sold;
        it.remain = remain;
      }
      const next = remain != null && remain > 0 ? "bid" : sel.value;
      setOV(uid, { state: next });
      renderGrid(); renderStats();
      /* 상태는 입찰 한 건 단위로 시트에 남겨야 한다.
         예전에는 '취소'만 저장해서, 거래완료로 바꿔도 새로고침하면 사라지고
         품목명 단위 폴백으로 떨어져 같은 품목의 다른 입찰까지 거래완료로 보였다.
         'bid' 는 기본값이므로 빈 값으로 저장해 행을 지운다. */
      pushOverride("state", uid, next === "bid" ? "" : next,
        `${row.name} ${STATE_LABEL[next] || next}`);
      pushStatus(row.rs.name,
        sel.value === "done" && (remain == null || remain === 0) ? "sold" : "sale",
        { sku: row.rs.sku, remain, skip: row.rs.settle || row.rs.matched === false });
    };
    sel.onclick = e => e.stopPropagation();
  });

  // 입찰가 수정: 칸 클릭 → 입력창, Enter/포커스아웃 저장, Esc 취소
  document.querySelectorAll("table.grid td.price").forEach(td => {
    td.onclick = () => {
      if (td.querySelector("input")) return;
      const uid = td.dataset.uid, row = ROWMAP.get(uid);
      if (!row) return;
      td.innerHTML = `<input class="pedit" value="${esc(row.price || "")}" inputmode="numeric">`;
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

function updateSelBar(all) {
  const bar = document.getElementById("selbar");
  const picked = all.filter(r => SEL.has(r.uid));
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
  /* 금액 합계는 시트의 입찰 1건을 1번만 센다.
     이름이 같은 품목(원단 Gray 실크 10·13번 등)은 화면에선 번호별로 나뉘지만
     실제로 낸 돈은 한 번이므로, 나뉜 것을 다 더하면 합계가 부풀려진다. */
  const counted = new Set();
  const total = BIDS.reduce((s, b) => {
    if (isDropped(b)) return s;                       // 취소한 입찰은 빼고 센다
    const key = b.row + "|" + b.name + "|" + b.contact;
    if (counted.has(key)) return s;
    counted.add(key);
    return s + (+b.price || 0);
  }, 0);
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
        return `<div class="stat"><b>${map.size}</b>입찰된 품목</div>` +
          `<div class="stat"><b>${bidCount}</b>총 입찰 건수</div>` +
          `<div class="stat"><b>${new Set(BIDS.map(b => b.name + "|" + b.contact)).size}</b>입찰자 수</div>` +
          `<div class="stat"><b>${[...map.values()].filter(l => l.length > 1).length}</b>경쟁 품목</div>` +
          `<div class="stat"><b>${n("done")}</b>거래완료 <small>${won(doneSum) || "₩0"}</small></div>` +
          `<div class="stat"><b>${won(total) || "₩0"}</b>입찰가 총합</div>`;
      })();
}

function renderCards() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const sortBy = document.getElementById("sort").value;
  const map = group(BIDS);

  let groups = [...map.entries()].map(([key, list]) => ({
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
