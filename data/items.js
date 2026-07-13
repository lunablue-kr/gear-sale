const CATS = {
  camera:  "카메라 · 액세서리",
  strobe:  "스트로보 · 조명",
  mod:     "모디파이어",
  grip:    "스탠드 · 그립",
  pc:      "컴퓨터 · 모니터",
  bg:      "배경지",
  etc:     "기타",
};

const ITEMS = [
  // ---------- 카메라 · 렌즈 ----------
  { cat:"camera", name:"EF 50mm F1.8 STM", brand:"Canon", qty:1, year:"", note:"", status:"sale" },
  { cat:"camera", name:"마운트 어댑터 EF-EOS R (컨트롤 링)", brand:"Canon", qty:1, year:"2021.11 구입", note:"", status:"sale" },
  { cat:"camera", name:"테더케이블 세트 (본선+연장선)", brand:"beluga", qty:1, year:"", note:"", status:"sale" },
  { cat:"camera", name:"Godox Xpro-C TTL 동조기", brand:"Godox", qty:1, year:"2020.10 구입", note:"캐논용", status:"sale" },
  { cat:"camera", name:"CT-16 트리거", brand:"Godox", qty:1, year:"2023.09 구입", note:"", status:"sale" },

  // ---------- 스트로보 · 조명 ----------
  { cat:"strobe", name:"Profoto D2 1000 AirTTL", brand:"Profoto", qty:3, year:"2018.06 구입", note:"모델링 램프·플래시 튜브·컨덴서 등 정기 정비 이력, 펌웨어 최신. 분리 판매 가능", ask:2000000, askUnit:"대당", status:"sale" },
  { cat:"strobe", name:"Profoto Acute2 2400 파워팩 + 헤드 ×2", brand:"Profoto", qty:1, year:"2019.09 구입", note:"Acute2/D4 헤드 2개 포함 세트. ⚠️ 헤드 1클립의 노출이 왔다갔다 해 점검이 필요합니다 — 이 점 감안해 저렴하게 내놓습니다", ask:1300000, status:"sale" },
  { cat:"strobe", name:"Godox QT1200IIM ×2", brand:"Godox", qty:2, year:"2020.10 구입", note:"플래시 튜브 교체·점검 이력. 분리 판매 가능", ask:450000, askUnit:"대당", status:"sale" },
  { cat:"strobe", name:"Nanlite Forza 720", brand:"Nanlite", qty:1, year:"2022.06 구입", note:"리플렉터 포함", ask:1600000, status:"sale" },
  { cat:"strobe", name:"Nanlite Forza 500 II", brand:"Nanlite", qty:1, year:"2024.12 구입", note:"", ask:900000, status:"sale" },
  { cat:"strobe", name:"Nanlite FS-300B", brand:"Nanlite", qty:1, year:"2025.12 구입", note:"최근 구입", ask:160000, status:"sale" },
  { cat:"strobe", name:"Nanlite PavoTube 6C", brand:"Nanlite", qty:1, year:"", note:"", ask:70000, status:"sale" },
  { cat:"strobe", name:"Nanlite FL-20G 프레넬 렌즈", brand:"Nanlite", qty:1, year:"2022.06 구입", note:"반도어 포함, Forza 시리즈용", ask:130000, status:"sale" },

  // ---------- 모디파이어 ----------
  { cat:"mod", name:"RFi 소프트박스 1×4'", brand:"Profoto", qty:1, year:"2018.06 구입", note:"", status:"sale" },
  { cat:"mod", name:"RFi 소프트박스 3×4'", brand:"Profoto", qty:1, year:"", note:"모서리 수선 이력 (2026.02)", status:"sale" },
  { cat:"mod", name:"RFi 소프트박스 4' OCTA", brand:"Profoto", qty:1, year:"2021.06 구입", note:"그리드 포함", status:"sale" },
  { cat:"mod", name:"Jemball Diffuser JBL-80", brand:"Aurora", qty:1, year:"2022.01 구입", note:"", status:"sale" },
  { cat:"mod", name:"Softlight Reflector Silver 뷰티디쉬", brand:"Profoto", qty:1, year:"", note:"허니컴 + 디퓨저 포함", status:"sale" },
  { cat:"mod", name:"뷰티디쉬 실버 (보웬스)", brand:"Godox", qty:1, year:"", note:"디퓨저 포함 (2024.12 신품 교체)", status:"sale" },
  { cat:"mod", name:"AMBITFUL 옵티컬 스누트", brand:"AMBITFUL", qty:1, year:"2020.09 구입", note:"프로포토 마운트, 고보 슬라이드·컬러젤 포함", status:"sale" },
  { cat:"mod", name:"7\" Grid Reflector", brand:"Profoto", qty:1, year:"2023.11 구입", note:"", status:"sale" },
  { cat:"mod", name:"리플렉터(보웬스) ×2 + 7인치 허니컴 그리드", brand:"Godox", qty:1, year:"2020.10 구입", note:"세트 판매", status:"sale" },
  { cat:"mod", name:"엄브렐러 3종 일괄", brand:"Profoto / Aurora", qty:3, year:"", note:"Profoto Deep Silver M · Aurora U-160C 실버(디퓨저 포함) · U-160A 화이트", status:"sale" },
  { cat:"mod", name:"원형 반사판 일괄", brand:"Aurora", qty:2, year:"", note:"실버 대형 1 · LD-60 S/W 1", status:"sale" },
  { cat:"mod", name:"Butterfly 대형 반사판 (240×240cm)", brand:"PERI", qty:1, year:"2019.06 구입", note:"전용 가방 포함", status:"sale" },
  { cat:"mod", name:"스피드링 ×4", brand:"Godox / Profoto", qty:4, year:"", note:"보웬스 마운트 2 · 프로포토 마운트 2", status:"sale" },
  { cat:"mod", name:"LEE 컬러젤 Pro-Pack (24색) + 낱장 필터", brand:"LEE Filters", qty:1, year:"", note:"CTO·CTB·디퓨전 낱장 포함", status:"sale" },
  { cat:"mod", name:"프리즘 렌즈 FX Dream 77mm", brand:"Prism Lens FX", qty:1, year:"", note:"", status:"sale" },
  { cat:"mod", name:"실크 · 디퓨전 일괄", brand:"Meking / Aurora / LEE", qty:1, year:"2022.11 구입", note:"Meking 120×120 프레임(실크 포함) · Aurora FRM79 라이트커터 ×2 · 블랙 실크 프레임 ×2 · LEE 216 디퓨전 롤 ×3", status:"sale" },

  // ---------- 스탠드 · 그립 ----------
  { cat:"grip", name:"KUPO C스탠드 풀세트", brand:"KUPO", qty:1, year:"", note:"CT-40M ×3 · CT-20M ×3 · CT-BS 베이스 ×3 · 350 Runway 베이스 ×3. 분리 판매 가능", status:"sale" },
  { cat:"grip", name:"Universal Stand (Air) ×2", brand:"KUPO", qty:2, year:"", note:"에어쿠션 스탠드", status:"sale" },
  { cat:"grip", name:"021 2-IN-1 나노 스탠드", brand:"KUPO", qty:1, year:"", note:"", status:"sale" },
  { cat:"grip", name:"배경 스탠드 · 오토폴 일괄", brand:"Manfrotto 외", qty:6, year:"", note:"Manfrotto Auto pole ×4 · 배경지 스탠드 · Manfrotto 003M 미니 베이스", status:"sale" },
  { cat:"grip", name:"그립 · 클램프 일괄", brand:"KUPO / Manfrotto / Avenger", qty:1, year:"", note:"그립헤드 ×9 · 그립암 ×6 · 슈퍼클램프 035 ×4 · J훅 ×3 · 042 익스텐션 암 · KCP-710B 콘비 클램프 · 155RC 틸트헤드 · 볼헤드 어댑터 등. 분리 판매 가능", status:"sale" },
  { cat:"grip", name:"MT190XPRO3 삼각대", brand:"Manfrotto", qty:1, year:"", note:"", status:"sale" },
  { cat:"grip", name:"Q-YT03 삼각대 확장 암", brand:"QZSD", qty:1, year:"2024.12 구입", note:"오버헤드 촬영용", status:"sale" },

  // ---------- 컴퓨터 · 모니터 ----------
  { cat:"pc", name:"MacBook Pro 16\" M1 Pro (2021)", brand:"Apple", qty:1, year:"2021.12 구입", note:"정품 충전기 포함", status:"sale" },
  { cat:"pc", name:"iMac 27\" Retina 5K (2017)", brand:"Apple", qty:1, year:"2018.05 구입", note:"", status:"sale" },
  { cat:"pc", name:"Apple Studio Display", brand:"Apple", qty:2, year:"", note:"2대 보유, 분리 판매 가능", status:"sale" },
  { cat:"pc", name:"LG 27UP850 4K 모니터", brand:"LG", qty:1, year:"2021.11 구입", note:"키보드·마우스 포함 가능", status:"sale" },
  { cat:"pc", name:"제우스랩 Z16P 16\" 포터블 모니터", brand:"Zeuslap", qty:1, year:"2022.11 구입", note:"", status:"sale" },
  { cat:"pc", name:"Wacom Intuos Pro PTH-860 (대형)", brand:"Wacom", qty:2, year:"2021.02 / 2023.04 구입", note:"펜 포함, 분리 판매 가능", status:"sale" },

  // ---------- 배경지 (SAVAGE / SUPERIOR 롤) ----------
  { cat:"bg", name:"배경지 #01 슈퍼 화이트 (하프 롤)", brand:"SAVAGE", qty:1, year:"", note:"", status:"sale" },
  { cat:"bg", name:"배경지 #93 아틱 화이트", brand:"SUPERIOR", qty:1, year:"", note:"", status:"sale" },
  { cat:"bg", name:"배경지 #03 코랄", brand:"SAVAGE", qty:1, year:"", note:"", status:"sale" },
  { cat:"bg", name:"배경지 #40 민트그린", brand:"SAVAGE", qty:1, year:"2023.07 구입", note:"", status:"sale" },
  { cat:"bg", name:"배경지 #67 루비", brand:"SAVAGE", qty:1, year:"2024.02 구입", note:"", status:"sale" },
  { cat:"bg", name:"배경지 #46 테크 그린", brand:"SAVAGE", qty:1, year:"2024.02 구입", note:"", status:"sale" },
  { cat:"bg", name:"배경지 #08 프라이머리 레드", brand:"SAVAGE", qty:1, year:"2024.02 구입", note:"", status:"sale" },

  // ---------- 기타 ----------
  { cat:"etc", name:"물촬영 세트", brand:"", qty:1, year:"", note:"수조 2종(35×60×40 / 100×80×10cm) · 호스릴 15m · 액체 흡입기", status:"sale" },
  { cat:"etc", name:"아크릴 봉 ×5", brand:"", qty:5, year:"", note:"사각 3 · 원형 2, 제품 촬영 받침용", status:"sale" },
  { cat:"etc", name:"케이블릴 ×3", brand:"seise / LUG", qty:3, year:"", note:"", status:"sale" },
  { cat:"etc", name:"3단 사다리", brand:"", qty:1, year:"", note:"", status:"sale" },
  { cat:"etc", name:"기타 액세서리 일괄", brand:"", qty:1, year:"", note:"SanDisk SD 128GB · 카드리더기 · 도킹스테이션 · ipTIME AX2004 공유기 · KUPO KS-312B 플레이트 · 태블릿 홀더 · 나사 변환 어댑터 등", status:"sale" },
];
ITEMS.forEach((it, i) => it.id = i);
