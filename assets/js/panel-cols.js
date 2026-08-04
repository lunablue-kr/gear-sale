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
