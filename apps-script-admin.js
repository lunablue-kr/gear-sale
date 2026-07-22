/* ============================================================
   구글시트 Apps Script 전체 사본 (배포본: 버전 6, 2026-07-22)

   ※ 이 파일은 "현재 스크립트에 실제로 들어가 있는 내용"의 백업입니다.
      원본 위치: 구글시트 → 확장 프로그램 → Apps Script

   하는 일
   ---------------------------------------------------------
   [기존] 입찰 접수(doPost) · 예약 품목 조회(doGet) · 중복정리 · 품목별 시트 자동정리
   [추가] 1) 관리자 진입   POST {action:'gate', pw}   → 통과 시 관리자 페이지 주소를 알려줌
          2) 입찰 내역     POST {action:'bids', pw}
          3) 판매상태 저장 POST {action:'setStatus', pw, items}
          4) 금액·메모     POST {action:'setOverride'|'getOverrides', pw}
          5) 판매상태 공개 GET  ?action=status  → 비밀번호 불필요,
                           품목명과 상태(sold/sale)만 나감. 입찰자 정보는 절대 안 나감

   보안
   ---------------------------------------------------------
   · 비밀번호는 코드가 아니라 스크립트 속성 ADMIN_PW 에 저장
   · 3회 틀리면 30분 잠금 + 소유자에게 메일 알림
   · 관리자 페이지 파일명(PANEL_FILE)은 이 코드에만 있음 — 판매 페이지 소스에 없음

   메일 알림 활성화 (최초 1회)
   ---------------------------------------------------------
   편집기에서 authorizeMail 을 실행하고 권한 요청을 승인.
   승인 전에도 잠금은 정상 동작하며, 메일만 발송되지 않습니다.

   잠금 즉시 해제 : 편집기에서 unlockAdmin 실행 (또는 30분 뒤 자동 해제)
   재배포 시 주의 : 반드시 "배포 관리 → 기존 배포 편집 → 새 버전".
                    "새 배포"로 하면 URL이 바뀌어 입찰 접수가 끊깁니다.
   ============================================================ */

// ===== 루나블루 장비 입찰 수집 + 품목별 자동정리 + 중복정리 (v5) =====
function doPost(e){
  var _b = {}; try { _b = JSON.parse(e.postData.contents); } catch (_) {}
  if(_b.action === 'gate')         return adminGate_(_b);
  if(_b.action === 'bids')         return adminBids_(_b);
  if(_b.action === 'setStatus')    return adminSetStatus_(_b);
  if(_b.action === 'setOverride')  return adminSetOverride_(_b);
  if(_b.action === 'getOverrides') return adminGetOverrides_(_b);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try{
    var d = JSON.parse(e.postData.contents);
    if(d.action === 'catalog'){ syncCatalog(d.items||[]); return json_({catalog:true}); }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('입찰');
    if(!sh){ sh = ss.insertSheet('입찰'); sh.appendRow(['접수시각','이름','연락처','품목','희망가','메시지']); }
    var now = new Date();
    (d.items||[]).forEach(function(it){ sh.appendRow([now, d.name, d.contact, it.name, it.price, d.message||'']); });
    dedup_(); rebuildSummary();
    return json_({ok:true});
  } finally { lock.releaseLock(); }
}
function doGet(e){
  if(e && e.parameter && e.parameter.action === 'status') return publicStatus_();
  if(e && e.parameter && e.parameter.dedup){ dedup_(); rebuildSummary(); return json_({deduped:true}); }
  if(e && e.parameter && e.parameter.rebuild){ rebuildSummary(); return json_({rebuilt:true}); }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('입찰');
  var items = [];
  if(sh && sh.getLastRow() > 1){
    items = sh.getRange(2,4,sh.getLastRow()-1,1).getValues().map(function(r){return r[0];}).filter(String);
    items = items.filter(function(v,i){return items.indexOf(v)===i;});
  }
  return json_({reserved:items});
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// 이름·연락처·품목·희망가·날짜(일) 모두 같으면 1개만 남김
function dedup_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var raw = ss.getSheetByName('입찰');
  if(!raw || raw.getLastRow() < 3) return;
  var data = raw.getRange(2,1,raw.getLastRow()-1,6).getValues();
  var seen = {}, keep = [];
  var tz = ss.getSpreadsheetTimeZone();
  data.forEach(function(r){
    var day = (r[0] instanceof Date) ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]);
    var key = [String(r[1]).trim(), String(r[2]).trim(), String(r[3]).trim(), String(r[4]).trim(), day].join('|');
    if(seen[key]) return;
    seen[key] = 1; keep.push(r);
  });
  if(keep.length === data.length) return; // 중복 없음
  raw.getRange(2,1,data.length,6).clearContent();
  if(keep.length) raw.getRange(2,1,keep.length,6).setValues(keep);
}

function syncCatalog(items){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('카탈로그');
  var rows = items.map(function(it){ return [it.cat, it.num, it.name]; });
  if(sh){
    var cur = sh.getLastRow()>0 ? sh.getRange(1,1,sh.getLastRow(),3).getValues() : [];
    if(JSON.stringify(cur) === JSON.stringify(rows)) return;
    sh.clearContents();
  } else { sh = ss.insertSheet('카탈로그'); }
  if(rows.length) sh.getRange(1,1,rows.length,3).setValues(rows);
  rebuildSummary();
}
function getCatalog(){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('카탈로그');
  if(sh && sh.getLastRow()>0){ return sh.getRange(1,1,sh.getLastRow(),3).getValues(); }
  return [];
}
function rebuildSummary(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var raw = ss.getSheetByName('입찰');
  var bids = [];
  if(raw && raw.getLastRow() > 1){ bids = raw.getRange(2,1,raw.getLastRow()-1,6).getValues(); }
  bids.sort(function(a,b){ return (a[0]>b[0])?1:(a[0]<b[0]?-1:0); });
  var byItem = {};
  bids.forEach(function(b){ var k=b[3]; (byItem[k]=byItem[k]||[]).push(b); });
  var cat = getCatalog();
  var out = [['카테고리','번호','품목','우선순위','이름','연락처','희망가','접수시각']];
  var used = {};
  cat.forEach(function(c){
    var name=c[2], list=byItem[name]||[]; used[name]=true;
    if(list.length===0){ out.push([c[0],c[1],name,'','','','','']); }
    else list.forEach(function(b,i){ out.push([c[0],c[1],name,i+1,b[1],b[2],b[4],b[0]]); });
  });
  Object.keys(byItem).forEach(function(name){
    if(used[name]) return;
    byItem[name].forEach(function(b,i){ out.push(['(미매칭)','',name,i+1,b[1],b[2],b[4],b[0]]); });
  });
  var sh = ss.getSheetByName('품목별');
  if(!sh) sh = ss.insertSheet('품목별'); else sh.clearContents();
  sh.getRange(1,1,out.length,8).setValues(out);
  sh.setFrozenRows(1);
}

/* ===== 관리자 기능 (v5) ============================================= */

var PANEL_FILE = 'panel-7f3ac91d5b.html';
var STATUS_SHEET = '판매상태';
var OVERRIDE_SHEET = '관리메모';
var MAX_FAILS = 3;
var LOCK_MINUTES = 30;

function jsonOut_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* 통과하면 null, 막히면 {error:...} */
function adminGuard_(body) {
  var props = PropertiesService.getScriptProperties();
  var now = new Date().getTime();

  var lockUntil = Number(props.getProperty('LOCK_UNTIL') || 0);
  if (lockUntil > now) {
    return { error: 'locked', mins: Math.ceil((lockUntil - now) / 60000) };
  }

  var pw = props.getProperty('ADMIN_PW');
  if (!pw) return { error: '스크립트 속성 ADMIN_PW 가 설정되지 않았습니다.' };

  if (String(body.pw || '') !== String(pw)) {
    var fails = Number(props.getProperty('FAIL_COUNT') || 0) + 1;
    if (fails >= MAX_FAILS) {
      props.setProperty('FAIL_COUNT', '0');
      props.setProperty('LOCK_UNTIL', String(now + LOCK_MINUTES * 60000));
      notifyLockout_();
      return { error: 'locked', mins: LOCK_MINUTES };
    }
    props.setProperty('FAIL_COUNT', String(fails));
    return { error: 'unauthorized', left: MAX_FAILS - fails };
  }

  props.setProperty('FAIL_COUNT', '0');
  props.deleteProperty('LOCK_UNTIL');
  return null;
}

/* 잠금 알림 메일 — 메일 권한이 없어도 잠금 자체는 동작하도록 감쌈 */
function notifyLockout_() {
  try {
    var to = Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(to,
      '[장비판매] 관리자 비밀번호 ' + MAX_FAILS + '회 오류 — ' + LOCK_MINUTES + '분 잠금',
      '관리자 페이지 접속 시도가 ' + MAX_FAILS + '회 실패해 ' + LOCK_MINUTES + '분간 잠겼습니다.\n\n' +
      '시각: ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss') + '\n\n' +
      '본인이 아니라면 스크립트 속성 ADMIN_PW 를 더 긴 값으로 바꿔주세요.\n' +
      '지금 바로 풀려면 편집기에서 unlockAdmin 을 실행하세요.');
  } catch (e) { }
}

/* 편집기에서 한 번 실행해 메일 권한을 승인하는 용도 */
function authorizeMail() {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
    '[장비판매] 메일 권한 확인',
    '이 메일을 받았다면 비밀번호 잠금 알림이 정상 동작합니다.');
}

/* 잠금 수동 해제 */
function unlockAdmin() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('LOCK_UNTIL');
  props.setProperty('FAIL_COUNT', '0');
}

function statusSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(STATUS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(STATUS_SHEET);
    sh.appendRow(['품목명', '상태', '갱신시각', '메모']);
  }
  return sh;
}

function overrideSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(OVERRIDE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OVERRIDE_SHEET);
    sh.appendRow(['종류', '키', '값', '갱신시각']);
  }
  return sh;
}

/* 관리자 진입: 비밀번호 확인 후 관리자 페이지 주소를 알려준다 */
function adminGate_(body) {
  var g = adminGuard_(body);
  if (g) { g.ok = false; return jsonOut_(g); }
  return jsonOut_({ ok: true, panel: PANEL_FILE });
}

/* 입찰 내역 조회 */
function adminBids_(body) {
  var g = adminGuard_(body);
  if (g) { g.ok = false; return jsonOut_(g); }

  var sheets = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    var values = sh.getDataRange().getValues();
    if (!values.length) return;
    sheets.push({
      sheet: sh.getName(),
      headers: values[0].map(function (h) { return String(h); }),
      rows: values.slice(1).map(function (r) {
        return r.map(function (c) {
          return (c instanceof Date) ? Utilities.formatDate(c, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : c;
        });
      })
    });
  });
  return jsonOut_({ ok: true, sheets: sheets });
}

/* 판매상태 저장 */
function adminSetStatus_(body) {
  var g = adminGuard_(body);
  if (g) { g.ok = false; return jsonOut_(g); }

  var items = body.items || [];
  if (!items.length) return jsonOut_({ ok: false, error: '저장할 품목이 없습니다.' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return jsonOut_({ ok: false, error: '다른 저장이 진행 중입니다.' }); }

  try {
    var sh = statusSheet_();
    var values = sh.getDataRange().getValues();
    var rowOf = {};
    for (var i = 1; i < values.length; i++) rowOf[String(values[i][0])] = i + 1;

    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    items.forEach(function (it) {
      var name = String(it.name || '').trim();
      if (!name) return;
      var row = [name, String(it.status || 'sale'), now, String(it.memo || '')];
      if (rowOf[name]) sh.getRange(rowOf[name], 1, 1, 4).setValues([row]);
      else { sh.appendRow(row); rowOf[name] = sh.getLastRow(); }
    });
    SpreadsheetApp.flush();
    return jsonOut_({ ok: true, saved: items.length, at: now });
  } finally {
    lock.releaseLock();
  }
}

/* 금액수정·거래메모 저장 */
function adminSetOverride_(body) {
  var g = adminGuard_(body);
  if (g) { g.ok = false; return jsonOut_(g); }

  var kind = String(body.kind || '');
  var key = String(body.key || '');
  if (kind !== 'price' && kind !== 'note') return jsonOut_({ ok: false, error: '알 수 없는 종류입니다.' });
  if (!key) return jsonOut_({ ok: false, error: '키가 없습니다.' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return jsonOut_({ ok: false, error: '다른 저장이 진행 중입니다.' }); }

  try {
    var sh = overrideSheet_();
    var values = sh.getDataRange().getValues();
    var target = 0;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === kind && String(values[i][1]) === key) { target = i + 1; break; }
    }
    var value = String(body.value == null ? '' : body.value);
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    if (!value) {
      if (target) sh.deleteRow(target);
    } else if (target) {
      sh.getRange(target, 1, 1, 4).setValues([[kind, key, value, now]]);
    } else {
      sh.appendRow([kind, key, value, now]);
    }
    SpreadsheetApp.flush();
    return jsonOut_({ ok: true, at: now });
  } finally {
    lock.releaseLock();
  }
}

/* 금액수정·거래메모 조회 */
function adminGetOverrides_(body) {
  var g = adminGuard_(body);
  if (g) { g.ok = false; return jsonOut_(g); }

  var price = {}, note = {};
  var sh = SpreadsheetApp.getActive().getSheetByName(OVERRIDE_SHEET);
  if (sh) {
    var values = sh.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var kind = String(values[i][0]), key = String(values[i][1]), val = String(values[i][2]);
      if (!key) continue;
      if (kind === 'price') price[key] = val;
      else if (kind === 'note') note[key] = val;
    }
  }
  return jsonOut_({ ok: true, price: price, note: note });
}

/* 판매상태 공개 조회 (비밀번호 불필요 — 품목명과 상태만) */
function publicStatus_() {
  var sold = [], sale = [];
  var sh = SpreadsheetApp.getActive().getSheetByName(STATUS_SHEET);
  if (sh) {
    var values = sh.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var name = String(values[i][0] || '').trim();
      var st = String(values[i][1] || '').trim();
      if (!name) continue;
      if (st === 'sold') sold.push(name);
      else if (st === 'sale') sale.push(name);
    }
  }
  return jsonOut_({ ok: true, sold: sold, sale: sale });
}
