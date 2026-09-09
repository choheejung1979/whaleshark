import { db, auth } from "./firebase-config.js";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// B2B 파트너 가격은 손님용 published/selling rate(reservation.html의
// PRICES)가 아니라 별도의 net rate(도매가)입니다 — 2026-08-24 전달받은 값:
//   Regular: 현지인 2,300 / 외국인 2,600
//   Fast Track: 현지인 3,000 / 외국인 3,150
//   VIP 패스트트랙: 국적 구분 없이 5,000 (2026-08-24 확정)
// 호핑투어/랜드투어는 "티켓 + 추가상품" 번들입니다 — 이 두 상품을 사면 티켓
// 가격 자체가 할인돼서 현지인 1,500 / 외국인 1,800으로 내려가고, 거기에
// 추가상품 금액(호핑 1,500 / 랜드 500, 국적 구분 없음)이 더해집니다.
// 그래서 최종 금액은:
//   호핑투어 = 할인티켓(1,500/1,800) + 호핑 추가금(1,500) = 3,000 / 3,300
//   랜드투어 = 할인티켓(1,500/1,800) + 랜드 추가금(500)   = 2,000 / 2,300
// 고래상어 티켓만 단독 판매(번들 아닐 때)는 net rate를 따로 두지 않고
// published rate 그대로 팝니다 — 2026-08-24 확정.
// 손님용 웹사이트(reservation.html)의 published/selling rate — 예약 폼에
// "정가 대비 이만큼 싸다"는 걸 보여주기 위한 비교용 기준값입니다. 실제
// 손님용 가격이 바뀌면 이것도 같이 맞춰야 합니다.
const PUBLISHED_PRICES = {
  VF: { PH: 5820, FOREIGN: 5820 },
  F: { PH: 3300, FOREIGN: 3600 },
  R: { PH: 2520, FOREIGN: 2820 },
  T: { PH: 1620, FOREIGN: 1920 },
};
const BUNDLE_TICKET_PRICE = { PH: 1500, FOREIGN: 1800 };
const ADDON_PRICE = { H: 1500, L: 500 };
const NET_PRICES = {
  VF: { PH: 5000, FOREIGN: 5000 },
  F: { PH: 3000, FOREIGN: 3150 },
  R: { PH: 2300, FOREIGN: 2600 },
  T: { PH: 1620, FOREIGN: 1920 },
};
// "단독 호핑투어(HG)"는 인당 단가가 아니라 그룹 인원 구간별 고정 총액입니다
// (2026-08-24 전달받은 값) — 이미 할인 티켓이 포함된 올인클루시브 가격이라
// 국적/추가상품 구분 없이 이 표에 있는 4개 구간(10/20/30/40명) 중에서만
// 선택합니다.
const GROUP_PRICES = { 10: 25000, 20: 30000, 30: 40000, 40: 45000 };
const TOUR_NAMES = { VF: "VIP 패스트트랙", F: "패스트트랙", R: "레귤러 고래상어투어", T: "고래상어 티켓만", H: "호핑투어", L: "랜드투어", HG: "단독 호핑투어" };
const TOUR_SHORT = { VF: "VIP FT", F: "FAST", R: "REGULAR", T: "TICKET", H: "HOPPING", L: "LAND", HG: "HOPPING(단독)" };
const STATUS_LABEL = { confirmed: "CONFIRMED", pending: "PENDING" };

// 고객 유형은 4개(현지인/중국인/한국인/외국인)로 보여주지만, 실제 가격은
// NET_PRICES가 PH/FOREIGN 두 단계만 갖고 있으므로 현지인만 PH, 나머지
// 셋(중국인/한국인/외국인)은 전부 FOREIGN 요금으로 계산합니다. 중국인/
// 한국인만의 별도 요금이 정해지면 이 매핑과 NET_PRICES를 함께 확장하면 됩니다.
function priceTierFor(nationality) {
  return nationality === "PH" ? "PH" : "FOREIGN";
}

let currentUid = null;
let currentAgency = null;
let selectedTour = "R";
let selectedMeetingTime = "07:30";
let selectedAddons = new Set();
let selectedNationality = "PH";
let selectedPay = "deposit";
let adultCount = 2;
let childCount = 0;
let selectedGroupSize = null;
let reservationsCache = new Map();
let txCache = new Map();

function fmtPeso(n) {
  return `₱${(Number(n) || 0).toLocaleString("en-US")}`;
}

function randomToken(prefix) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const raw = btoa(String.fromCharCode(...bytes)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${prefix}-${raw}`;
}

// 진짜 순번 카운터(Firestore 트랜잭션/추가 규칙)를 새로 두지 않고, 문서 ID
// 자체에서 5자리 표시용 코드를 뽑아냅니다 — 화면에 보여주는 참고번호일 뿐,
// 회계상 연속 번호가 필요하면 나중에 별도 카운터로 바꿔야 합니다.
function bookingCode(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `BW-${String(hash % 100000).padStart(5, "0")}`;
}

function fmtDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("ko-KR");
}

const loginView = document.getElementById("login-view");
const portalView = document.getElementById("portal-view");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginView.style.display = "block";
    portalView.style.display = "none";
    currentUid = null;
    return;
  }
  currentUid = user.uid;
  const snap = await getDoc(doc(db, "agencies", currentUid));
  if (!snap.exists()) {
    document.getElementById("login-message").innerHTML =
      `<p class="pt-msg error">이 계정은 에이전시로 등록되어 있지 않습니다.</p>`;
    await signOut(auth);
    return;
  }
  loginView.style.display = "none";
  portalView.style.display = "flex";
  const name = snap.data().name;
  document.getElementById("header-brand").textContent = `🐋 ${name}`;
  document.getElementById("agency-name-title").textContent = name;
  document.getElementById("greeting-name").textContent = name;
  listenAgency();
  listenReservations();
  listenTransactions();
  listenDepositRequests();
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const msgEl = document.getElementById("login-message");
  msgEl.innerHTML = "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    msgEl.innerHTML = `<p class="pt-msg error">로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요.</p>`;
  }
});

document.getElementById("btn-signout").addEventListener("click", () => signOut(auth));

// ── Sidebar nav ──────────────────────────────────────────────────
document.getElementById("pt-nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".pt-nav-item");
  if (!btn) return;
  switchView(btn.dataset.view);
});
document.getElementById("btn-goto-reservation").addEventListener("click", () => switchView("reservation"));
document.getElementById("btn-goto-deposit").addEventListener("click", () => switchView("deposit"));

function switchView(view) {
  document.querySelectorAll(".pt-nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  document.querySelectorAll(".pt-view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`));
}

// ── Balance ──────────────────────────────────────────────────────
function listenAgency() {
  onSnapshot(doc(db, "agencies", currentUid), (snap) => {
    if (!snap.exists()) return;
    currentAgency = snap.data();
    const balanceText = fmtPeso(currentAgency.depositBalance);
    document.getElementById("stat-balance").textContent = balanceText;
    document.getElementById("stat-balance-2").textContent = balanceText;
    updateEstimate();
  });
}

// ── New reservation form ────────────────────────────────────────
// 추가 옵션(호핑/랜드)이 하나라도 체크된 상태로 "고래상어 티켓만"을 고르면,
// 티켓 자체가 번들 할인가(BUNDLE_TICKET_PRICE)로 바뀌고 거기에 체크된
// 추가상품 금액이 더해집니다. 다른 투어(VIP/패스트트랙/레귤러)에 추가상품을
// 붙이면 그 투어의 정가 위에 추가상품 금액만 그대로 더해집니다.
function pricePerPersonFor(tour, addons, nationality) {
  const tier = priceTierFor(nationality);
  const hasAddon = addons.size > 0;
  const base = (tour === "T" && hasAddon) ? BUNDLE_TICKET_PRICE[tier] : (NET_PRICES[tour]?.[tier] || 0);
  let addonSum = 0;
  addons.forEach(a => { addonSum += ADDON_PRICE[a] || 0; });
  return base + addonSum;
}

const ADDON_LABEL = { H: "조인 호핑투어", HG: "단독 호핑투어", L: "랜드투어" };

// 정가(published) 대비 순가(net)가 얼마나 싼지 눈에 보이게, 정가는 빨간
// 취소선으로 보여주고 그 옆에 실제 net 가격을 보여줍니다.
function renderBreakdown() {
  const el = document.getElementById("price-breakdown");
  const isGroup = selectedAddons.has("HG");
  if (isGroup) {
    el.innerHTML = selectedGroupSize
      ? `<div class="pt-breakdown-row"><span class="pt-breakdown-label">단독 호핑투어 (${selectedGroupSize}명, 티켓 할인 포함가)</span><span class="pt-breakdown-value pt-breakdown-now">${fmtPeso(GROUP_PRICES[selectedGroupSize])}</span></div>`
      : "";
    return;
  }
  const perAddons = new Set([...selectedAddons].filter(a => a !== "HG"));
  const tier = priceTierFor(selectedNationality);
  const hasAddon = perAddons.size > 0;
  const isBundledTicket = selectedTour === "T" && hasAddon;
  const netBase = isBundledTicket ? BUNDLE_TICKET_PRICE[tier] : (NET_PRICES[selectedTour]?.[tier] || 0);
  const publishedBase = isBundledTicket ? PUBLISHED_PRICES.T[tier] : (PUBLISHED_PRICES[selectedTour]?.[tier] || 0);

  const rows = [];
  rows.push(`
    <div class="pt-breakdown-row">
      <span class="pt-breakdown-label">${TOUR_NAMES[selectedTour]} (1인)</span>
      <span class="pt-breakdown-value">
        ${publishedBase > netBase ? `<span class="pt-breakdown-was">${fmtPeso(publishedBase)}</span>` : ""}
        <span class="pt-breakdown-now">${fmtPeso(netBase)}</span>
      </span>
    </div>
  `);
  perAddons.forEach(a => {
    rows.push(`
      <div class="pt-breakdown-row pt-breakdown-sub">
        <span>+ ${ADDON_LABEL[a]} 추가</span>
        <span>${fmtPeso(ADDON_PRICE[a])}</span>
      </div>
    `);
  });
  const people = adultCount + childCount;
  rows.push(`
    <div class="pt-breakdown-row" style="border-top:1px dashed ${'#cbd5e1'}; padding-top:8px; margin-top:2px;">
      <span class="pt-breakdown-label">인당 합계 × ${people}명</span>
      <span class="pt-breakdown-value">${fmtPeso(netBase + [...perAddons].reduce((s, a) => s + (ADDON_PRICE[a] || 0), 0))}</span>
    </div>
  `);
  el.innerHTML = rows.join("");
}

function updateEstimate() {
  let total;
  if (selectedAddons.has("HG")) {
    total = selectedGroupSize ? GROUP_PRICES[selectedGroupSize] : 0;
  } else {
    const people = adultCount + childCount;
    total = pricePerPersonFor(selectedTour, selectedAddons, selectedNationality) * people;
  }
  renderBreakdown();
  document.getElementById("b-total").textContent = fmtPeso(total);
  return total;
}

// "단독 호핑투어(HG)"는 이제 추가옵션 체크박스입니다 — 체크하면 그룹
// 인원 구간(GUESTS) 선택으로 바뀌고, 이미 국적/성인아동 구분 없는
// 올인클루시브 총액이라 투어 종류/고객 유형/성인·아동 입력이 의미가 없어서
// 숨깁니다. "조인 호핑투어(H)"와는 같이 선택할 수 없습니다(같은 호핑투어의
// 다른 방식이라 동시에 둘 다 예약하는 게 아니라서).
function toggleGroupFields() {
  const isGroup = selectedAddons.has("HG");
  document.getElementById("tour-type-field").style.display = isGroup ? "none" : "block";
  document.getElementById("individual-guests-field").style.display = isGroup ? "none" : "flex";
  document.getElementById("group-guests-field").style.display = isGroup ? "block" : "none";
  document.getElementById("nationality-field").style.display = isGroup ? "none" : "block";
  updateMeetingTime();
}

// 레귤러(R)는 고객이 오전 07:30/09:00 중 미팅 시간을 직접 고르고, 패스트트랙/
// VIP는 같은 07:30에 미팅하지만 선택지 없이 고정입니다. 티켓만(T)과 단독
// 호핑투어(HG)는 미팅 시간 자체가 없습니다 — reservation.html의 손님용 예약
// 폼과 동일한 규칙입니다.
function updateMeetingTime() {
  const group = document.getElementById("meeting-time-field");
  const pillsBlock = document.getElementById("meeting-time-pills");
  const fixedNote = document.getElementById("meeting-fixed-note");
  const isGroup = selectedAddons.has("HG");
  if (isGroup || selectedTour === "T") {
    group.style.display = "none";
    return;
  }
  group.style.display = "block";
  if (selectedTour === "R") {
    pillsBlock.style.display = "flex";
    fixedNote.style.display = "none";
  } else {
    pillsBlock.style.display = "none";
    fixedNote.style.display = "block";
    selectedMeetingTime = "07:30";
    document.getElementById("b-meeting-time").value = "07:30";
    document.querySelectorAll("#meeting-time-pills .pt-pill").forEach(p => p.classList.toggle("active", p.dataset.time === "07:30"));
  }
}

document.getElementById("meeting-time-pills").addEventListener("click", (e) => {
  const btn = e.target.closest(".pt-pill");
  if (!btn) return;
  selectedMeetingTime = btn.dataset.time;
  document.getElementById("b-meeting-time").value = selectedMeetingTime;
  document.querySelectorAll("#meeting-time-pills .pt-pill").forEach(p => p.classList.toggle("active", p === btn));
});

document.getElementById("tour-pills").addEventListener("click", (e) => {
  const btn = e.target.closest(".pt-pill");
  if (!btn) return;
  selectedTour = btn.dataset.tour;
  document.getElementById("b-tour").value = selectedTour;
  document.querySelectorAll("#tour-pills .pt-pill").forEach(p => p.classList.toggle("active", p === btn));
  document.getElementById("ticket-only-note").style.display = selectedTour === "T" ? "block" : "none";
  document.getElementById("pickup-note").style.display = selectedTour === "T" ? "none" : "block";
  updateMeetingTime();
  updateEstimate();
});

// 페이지 로드 시 기본 선택값(레귤러)에 맞춰 미팅 시간 필드를 바로 보여줍니다.
updateMeetingTime();

document.getElementById("group-size-pills").addEventListener("click", (e) => {
  const btn = e.target.closest(".pt-pill");
  if (!btn) return;
  selectedGroupSize = Number(btn.dataset.size);
  document.querySelectorAll("#group-size-pills .pt-pill").forEach(p => p.classList.toggle("active", p === btn));
  updateEstimate();
});

function setAddonPillState(addon, isOn) {
  const btn = document.querySelector(`#addon-pills .pt-pill[data-addon="${addon}"]`);
  btn.classList.toggle("active", isOn);
  btn.textContent = (isOn ? "☑ " : "☐ ") + ADDON_LABEL[addon];
  if (isOn) selectedAddons.add(addon); else selectedAddons.delete(addon);
  const dateField = document.getElementById(`addon-date-field-${addon}`);
  if (dateField) {
    dateField.style.display = isOn ? "flex" : "none";
    if (!isOn) document.getElementById(`addon-date-${addon}`).value = "";
  }
}

document.getElementById("addon-pills").addEventListener("click", (e) => {
  const btn = e.target.closest(".pt-pill");
  if (!btn) return;
  const addon = btn.dataset.addon;
  const isOn = !btn.classList.contains("active");

  // 조인(H) ↔ 단독(HG)은 서로 배타적 — 하나를 켜면 다른 하나는 꺼집니다.
  if (isOn && addon === "H" && selectedAddons.has("HG")) setAddonPillState("HG", false);
  if (isOn && addon === "HG" && selectedAddons.has("H")) setAddonPillState("H", false);

  setAddonPillState(addon, isOn);
  document.getElementById("addon-date-row").style.display =
    (selectedAddons.has("H") || selectedAddons.has("L")) ? "flex" : "none";

  toggleGroupFields();
  updateEstimate();
});

document.getElementById("nationality-pills").addEventListener("click", (e) => {
  const btn = e.target.closest(".pt-pill");
  if (!btn) return;
  selectedNationality = btn.dataset.nationality;
  document.getElementById("b-nationality").value = selectedNationality;
  document.querySelectorAll("#nationality-pills .pt-pill").forEach(p => p.classList.toggle("active", p === btn));
  updateEstimate();
});

document.getElementById("pay-pills").addEventListener("click", (e) => {
  const btn = e.target.closest(".pt-pill");
  if (!btn) return;
  selectedPay = btn.dataset.pay;
  document.getElementById("b-pay").value = selectedPay;
  document.querySelectorAll("#pay-pills .pt-pill").forEach(p => p.classList.toggle("active", p === btn));
});

// 성인/아동 인원 스테퍼. 아동 전용 요금은 아직 안 주셔서 일단 성인과 같은
// 단가로 계산합니다 — 확정되면 pricePerPersonFor에 아동 분기를 추가하면 됩니다.
document.querySelectorAll(".pt-stepper-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const delta = Number(btn.dataset.delta);
    if (btn.dataset.step === "adult") {
      adultCount = Math.max(1, adultCount + delta);
      document.getElementById("b-adults-display").textContent = adultCount;
    } else {
      childCount = Math.max(0, childCount + delta);
      document.getElementById("b-children-display").textContent = childCount;
    }
    updateEstimate();
  });
});

document.getElementById("booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById("booking-message");
  msgEl.innerHTML = "";

  const tourType = selectedTour;
  const isGroup = selectedAddons.has("HG");
  const paymentMethod = selectedPay;
  const date = document.getElementById("b-date").value;
  const people = isGroup ? (selectedGroupSize || 0) : (adultCount + childCount);
  // 그룹명을 직접 입력받지 않고, 에이전시명 + 날짜로 자동으로 채웁니다
  // (개별 고객 정보 없이 "이 에이전시가 이 날짜에 몇 명" 만 있으면 충분).
  const label = `${currentAgency?.name || "Agency"} ${date}`;
  const totalPrice = updateEstimate();

  // 체크된 추가상품마다 그 상품의 날짜도 반드시 입력해야 합니다.
  const addonDates = {};
  for (const a of selectedAddons) {
    const v = document.getElementById(`addon-date-${a}`).value;
    if (!v) {
      msgEl.innerHTML = `<p class="pt-msg error">${ADDON_LABEL[a]} 날짜를 선택해주세요.</p>`;
      return;
    }
    addonDates[a] = v;
  }

  if (!date || people < 1 || (isGroup && !selectedGroupSize)) {
    msgEl.innerHTML = `<p class="pt-msg error">모든 항목을 입력해주세요.</p>`;
    return;
  }
  if (paymentMethod === "deposit" && (!currentAgency || currentAgency.depositBalance < totalPrice)) {
    msgEl.innerHTML = `<p class="pt-msg error">예치금 잔액이 부족합니다 (필요: ${fmtPeso(totalPrice)}). 보라카이션 오피스페이를 선택하거나 입금을 요청하세요.</p>`;
    return;
  }

  try {
    const reservationRef = await addDoc(collection(db, "reservations"), {
      tourType: isGroup ? "HG" : tourType,
      addons: [...selectedAddons],
      addonDates,
      date,
      meetingTime: (!isGroup && (tourType === "R" || tourType === "F" || tourType === "VF")) ? selectedMeetingTime : "",
      pickup: "Jollibee Main Road",
      people,
      adults: isGroup ? people : adultCount,
      children: isGroup ? 0 : childCount,
      name: label,
      email: auth.currentUser.email,
      nationality: isGroup ? "ALL" : selectedNationality,
      pricePerPerson: isGroup ? Math.round(totalPrice / people) : pricePerPersonFor(tourType, selectedAddons, selectedNationality),
      totalPrice,
      currency: "PHP",
      status: paymentMethod === "deposit" ? "confirmed" : "pending",
      bookedBy: "agency",
      agencyId: currentUid,
      qrToken: randomToken("WHALE"),
      checkedIn: false,
      depositApplied: paymentMethod === "deposit" ? false : true,
      paymentMethod,
      createdAt: serverTimestamp()
    });

    if (paymentMethod === "deposit") {
      // 잔액 차감 + depositApplied 확정을 하나의 트랜잭션으로.
      const agencyDocRef = doc(db, "agencies", currentUid);
      await runTransaction(db, async (tx) => {
        const agencySnap = await tx.get(agencyDocRef);
        const newBalance = agencySnap.data().depositBalance - totalPrice;
        tx.update(agencyDocRef, { depositBalance: newBalance, lastPurchaseRef: reservationRef.id });
        tx.update(reservationRef, { depositApplied: true });
      });
      await addDoc(collection(db, "agencyTransactions"), {
        agencyId: currentUid,
        type: "purchase",
        amount: -totalPrice,
        note: `${TOUR_NAMES[tourType]} ${date} ${people}명`,
        createdAt: serverTimestamp(),
        createdBy: currentUid
      });
    }

    msgEl.innerHTML = `<p class="pt-msg success">예약이 ${paymentMethod === "deposit" ? "확정" : "등록(현장결제 예정)"}되었습니다.</p>`;
    e.target.reset();
    selectedAddons.clear();
    document.querySelectorAll("#addon-pills .pt-pill").forEach(btn => {
      btn.classList.remove("active");
      btn.textContent = "☐ " + ADDON_LABEL[btn.dataset.addon];
    });
    document.getElementById("addon-date-row").style.display = "none";
    document.getElementById("addon-date-H").value = "";
    document.getElementById("addon-date-L").value = "";
    document.getElementById("addon-date-HG").value = "";
    adultCount = 2;
    childCount = 0;
    document.getElementById("b-adults-display").textContent = adultCount;
    document.getElementById("b-children-display").textContent = childCount;
    selectedGroupSize = null;
    document.querySelectorAll("#group-size-pills .pt-pill").forEach(p => p.classList.remove("active"));
    toggleGroupFields();
    updateEstimate();
    setTimeout(() => switchView("dashboard"), 900);
  } catch (err) {
    console.error("Booking failed:", err);
    msgEl.innerHTML = `<p class="pt-msg error">예약에 실패했습니다. 잔액을 다시 확인해주세요.</p>`;
  }
});

// ── Reservations (dashboard recent + full list) ─────────────────
function listenReservations() {
  onSnapshot(
    query(collection(db, "reservations"), where("agencyId", "==", currentUid)),
    (snapshot) => {
      reservationsCache = new Map();
      snapshot.forEach(d => reservationsCache.set(d.id, d.data()));
      renderDashboardStats();
      renderRecentList();
      renderAllList();
    }
  );
}

function badgeFor(b) {
  if (b.checkedIn) return `<span class="pt-badge pt-badge-used">체크인완료</span>`;
  if (b.status === "pending") return `<span class="pt-badge pt-badge-pending">PENDING</span>`;
  return `<span class="pt-badge pt-badge-confirmed">${STATUS_LABEL[b.status] || b.status}</span>`;
}

const ADDON_SHORT = { H: "조인호핑", L: "랜드" };
function addonLabel(addons) {
  // HG(단독 호핑투어)는 이미 메인 투어 라벨에 나오니 여기선 나머지만 붙입니다.
  const shown = (addons || []).filter(a => a !== "HG");
  if (!shown.length) return "";
  return " + " + shown.map(a => ADDON_SHORT[a] || a).join("/");
}

function bookingRowHtml(id, b) {
  // Cash @ Office는 관리자가 실제 현금 수령을 확인(status: pending → confirmed)
  // 하기 전까지는 QR을 보여주지 않습니다 — 결제 전에 입장 가능한 티켓처럼
  // 보이면 안 되니까요. Deposit은 예약과 동시에 이미 잔액이 차감되니 바로 보여줍니다.
  const qrReady = b.paymentMethod !== "cash_office" || b.status === "confirmed";
  const qrAction = qrReady
    ? `<button class="pt-btn pt-btn-ghost" data-action="qr" data-id="${id}">QR 보기</button>`
    : `<span class="pt-badge pt-badge-pending" style="align-self:center;">결제 확인 후 QR 발급</span>`;
  return `
    <div class="pt-booking-row">
      <div>
        <div class="pt-booking-code">${bookingCode(id)}</div>
        <div class="pt-booking-main">${b.date} · ${TOUR_SHORT[b.tourType] || b.tourType}${addonLabel(b.addons)}</div>
        <div class="pt-booking-sub">${b.name} · ${b.tourType === "HG" ? `${b.people}명 그룹` : `성인${b.adults ?? b.people}${b.children ? ` · 아동${b.children}` : ""}`} · ${fmtPeso(b.totalPrice)} · ${b.paymentMethod === "cash_office" ? "보라카이션 오피스페이" : "Deposit"}</div>
        ${badgeFor(b)}
      </div>
      ${qrAction}
    </div>
  `;
}

function sortedReservations() {
  return [...reservationsCache.entries()].sort((a, b) => (a[1].date < b[1].date ? 1 : -1));
}

function renderDashboardStats() {
  const todayKey = new Date().toISOString().slice(0, 10);
  let today = 0, upcoming = 0;
  reservationsCache.forEach(b => {
    if (b.date === todayKey) today++;
    else if (b.date > todayKey) upcoming++;
  });
  document.getElementById("stat-today").textContent = today;
  document.getElementById("stat-upcoming").textContent = upcoming;
}

function renderRecentList() {
  const el = document.getElementById("recent-list");
  const rows = sortedReservations().slice(0, 5);
  el.innerHTML = rows.length ? rows.map(([id, b]) => bookingRowHtml(id, b)).join("") : `<p class="pt-empty">예약 내역이 없습니다.</p>`;
}

function renderAllList() {
  const el = document.getElementById("all-list");
  const rows = sortedReservations();
  el.innerHTML = rows.length ? rows.map(([id, b]) => bookingRowHtml(id, b)).join("") : `<p class="pt-empty">예약 내역이 없습니다.</p>`;
}

document.querySelectorAll("#recent-list, #all-list").forEach(el => {
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='qr']");
    if (!btn) return;
    const b = reservationsCache.get(btn.dataset.id);
    if (b) openQrModal(btn.dataset.id, b);
  });
});

function openQrModal(id, booking) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="pt-modal-overlay" id="modal-overlay">
      <div class="pt-modal-box">
        <h3>${bookingCode(id)} · ${booking.date} · ${booking.people}명</h3>
        <div class="pt-qr-frame"><canvas id="qr-canvas"></canvas></div>
        <button class="pt-btn pt-btn-secondary" id="btn-close">닫기</button>
      </div>
    </div>
  `;
  QRCode.toCanvas(document.getElementById("qr-canvas"), booking.qrToken, { width: 200 });
  document.getElementById("btn-close").addEventListener("click", () => { root.innerHTML = ""; });
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") root.innerHTML = "";
  });
}

// ── Deposit / transactions ledger ───────────────────────────────
function listenTransactions() {
  onSnapshot(
    query(collection(db, "agencyTransactions"), where("agencyId", "==", currentUid)),
    (snapshot) => {
      txCache = new Map();
      snapshot.forEach(d => txCache.set(d.id, d.data()));
      renderTxList();
    }
  );
}

function renderTxList() {
  const el = document.getElementById("tx-list");
  const rows = [...txCache.values()].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  if (!rows.length) {
    el.innerHTML = `<p class="pt-empty">거래 내역이 없습니다.</p>`;
    return;
  }
  el.innerHTML = rows.map(tx => `
    <div class="pt-tx-row">
      <div>
        <div class="pt-tx-note">${tx.type === "topup" ? "입금 반영" : (tx.note || "예약 결제")}</div>
        <div class="pt-tx-date">${fmtDate(tx.createdAt)}</div>
      </div>
      <div class="pt-tx-amount ${tx.amount >= 0 ? "positive" : "negative"}">${tx.amount >= 0 ? "+" : ""}${fmtPeso(tx.amount)}</div>
    </div>
  `).join("");
}

// ── Deposit top-up requests ─────────────────────────────────────
// 실제 송금(계좌이체 등)은 이 시스템 밖에서 이루어지고, 여기서는 "이만큼
// 넣었으니 확인해달라"는 신청만 남깁니다. 관리자가 admin.html에서 승인하면
// 그때 잔액이 실제로 올라갑니다.
let depositRequestsCache = new Map();
const DR_STATUS_LABEL = { pending: "확인중", approved: "승인됨", rejected: "거절됨" };
const DR_STATUS_CLASS = { pending: "pt-badge-pending", approved: "pt-badge-used", rejected: "pt-badge-confirmed" };

function listenDepositRequests() {
  onSnapshot(
    query(collection(db, "depositRequests"), where("agencyId", "==", currentUid)),
    (snapshot) => {
      depositRequestsCache = new Map();
      snapshot.forEach(d => depositRequestsCache.set(d.id, d.data()));
      renderDepositRequestList();
    }
  );
}

function renderDepositRequestList() {
  const el = document.getElementById("deposit-request-list");
  const rows = [...depositRequestsCache.values()].sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0));
  if (!rows.length) {
    el.innerHTML = `<p class="pt-empty">신청 내역이 없습니다.</p>`;
    return;
  }
  el.innerHTML = rows.map(r => `
    <div class="pt-tx-row">
      <div>
        <div class="pt-tx-note">${r.note || "입금 신청"}</div>
        <div class="pt-tx-date">${fmtDate(r.requestedAt)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="pt-tx-amount positive">+${fmtPeso(r.amount)}</span>
        <span class="pt-badge ${DR_STATUS_CLASS[r.status] || ""}">${DR_STATUS_LABEL[r.status] || r.status}</span>
      </div>
    </div>
  `).join("");
}

document.getElementById("deposit-request-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById("deposit-request-message");
  msgEl.innerHTML = "";
  const amount = Number(document.getElementById("dr-amount").value);
  const depositDate = document.getElementById("dr-date").value;
  const depositorName = document.getElementById("dr-name").value.trim();

  if (!amount || amount <= 0) {
    msgEl.innerHTML = `<p class="pt-msg error">올바른 금액을 입력해주세요.</p>`;
    return;
  }
  if (!depositDate || !depositorName) {
    msgEl.innerHTML = `<p class="pt-msg error">입금 날짜와 입금자 이름을 입력해주세요.</p>`;
    return;
  }

  try {
    await addDoc(collection(db, "depositRequests"), {
      agencyId: currentUid,
      agencyName: currentAgency?.name || "",
      amount,
      method: "gcash",
      depositDate,
      depositorName,
      note: `GCash · ${depositDate} · ${depositorName}`,
      status: "pending",
      requestedAt: serverTimestamp(),
      resolvedAt: null,
      resolvedBy: null
    });
    msgEl.innerHTML = `<p class="pt-msg success">입금 신청이 접수되었습니다. 관리자 확인 후 잔액에 반영됩니다.</p>`;
    e.target.reset();
  } catch (err) {
    console.error("Deposit request failed:", err);
    msgEl.innerHTML = `<p class="pt-msg error">신청에 실패했습니다. 다시 시도해주세요.</p>`;
  }
});
