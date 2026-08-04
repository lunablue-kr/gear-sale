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

  /* 로컬 반영·화면 갱신을 먼저 끝내고, 서버 전송은 한꺼번에 병렬로 보낸다.
     건별로 await 하면 왕복(2~3초)이 건수만큼 쌓여 10건에 30초씩 걸렸다. */
  adminPw();                                    // 비밀번호를 먼저 확보 (병렬 중 프롬프트 방지)
  todo.forEach(r => setOV(r.uid, { state: next }));
  SEL.clear();
  renderGrid(); renderStats();
  syncFlag(`${todo.length}건 ${label} 처리 중…`);

  const jobs = todo.map(r => pushOverride("state", r.uid, next, `${r.name} ${label}`));

  /* 구매페이지 반영 — 품목 단위로 모아 한 번의 요청으로 */
  const items = new Map();
  todo.forEach(r => items.set(r.rs.sku || r.rs.name, r));
  const statusList = [];
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
      statusList.push({ name: r.rs.name, status: remain === 0 ? "sold" : "sale",
        sku: r.rs.sku, remain: total > 1 ? remain : null, skip });
    } else if (next === "bid") {
      /* 완료였던 걸 미처리로 되돌리면 판매중 복원 — 단, 같은 품목에 아직 완료 입찰이 남아 있으면 그대로 */
      const wasSold = SHEET_SOLD_SKU.has(r.rs.sku) || SHEET_SOLD.has(r.rs.name) || r.rs.status === "sold";
      const hasDone = [...ROWMAP.values()].some(o => o.rs.name === r.rs.name && stateOf(o) === "done");
      if (wasSold && !hasDone) statusList.push({ name: r.rs.name, status: "sale", sku: r.rs.sku, remain: fullQty, skip });
    } else {
      const others = [...ROWMAP.values()]
        .filter(o => o.rs.name === r.rs.name && stateOf(o) !== "drop" && !isDropped(o));
      if (!others.length) statusList.push({ name: r.rs.name, status: "sale", sku: r.rs.sku, remain: fullQty, skip });
    }
  }
  if (statusList.length) jobs.push(pushStatusBatch(statusList));
  await Promise.all(jobs);
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

