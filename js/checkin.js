import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const TOUR_NAMES = { VF: "VIP 패스트트랙", F: "패스트트랙", R: "레귤러 고래상어투어", T: "고래상어 티켓만", H: "호핑투어", L: "랜드투어", HG: "단독 호핑투어" };

const loginView = document.getElementById("login-view");
const checkScreen = document.getElementById("check-screen");
const titleEl = document.querySelector("#check-card h1");
const bodyEl = document.getElementById("check-body");
const summaryOverlay = document.getElementById("summary-overlay");
const summaryTotalEl = document.getElementById("summary-total");
const summaryBodyEl = document.getElementById("summary-body");

let scanner = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    loginView.style.display = "block";
    checkScreen.style.display = "none";
    if (scanner) { scanner.stop().catch(() => {}); scanner = null; }
    return;
  }
  loginView.style.display = "none";
  checkScreen.style.display = "flex";
  startScanner();
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
    msgEl.innerHTML = `<p class="portal-message error">로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요.</p>`;
  }
});

document.getElementById("btn-signout").addEventListener("click", () => signOut(auth));

document.getElementById("btn-today-summary").addEventListener("click", () => {
  checkScreen.style.display = "none";
  summaryOverlay.style.display = "flex";
  loadTodaySummary();
});
document.getElementById("btn-summary-close").addEventListener("click", () => {
  summaryOverlay.style.display = "none";
  checkScreen.style.display = "flex";
});

// 리버타드 현장에서 "오늘 총 몇 팀/몇 명이 체크인했고, 어느 여행사(B2B)를
// 통해 왔는지" 한눈에 보기 위한 요약입니다. checkedInAt이 오늘 00:00 이후인
// 예약만 모아서 agencyId 기준으로 묶습니다 — 직접 예약(B2B 아님)은
// "직접예약"으로 따로 묶습니다.
async function loadTodaySummary() {
  summaryTotalEl.textContent = "…";
  summaryBodyEl.innerHTML = "";
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "reservations"),
      where("checkedInAt", ">=", Timestamp.fromDate(startOfToday))
    );
    const snap = await getDocs(q);

    const agencyIds = new Set();
    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      rows.push(d);
      if (d.bookedBy === "agency" && d.agencyId) agencyIds.add(d.agencyId);
    });

    const agencyNames = {};
    await Promise.all([...agencyIds].map(async (uid) => {
      try {
        const aSnap = await getDocs(query(collection(db, "agencies"), where("__name__", "==", uid)));
        aSnap.forEach((a) => { agencyNames[uid] = a.data().name; });
      } catch (err) {
        console.error("Agency name lookup failed:", err);
      }
    }));

    const groups = new Map(); // label -> { count, people }
    rows.forEach((d) => {
      const label = (d.bookedBy === "agency" && d.agencyId)
        ? (agencyNames[d.agencyId] || "이름 미확인 업체")
        : "직접예약";
      const g = groups.get(label) || { count: 0, people: 0 };
      g.count += 1;
      g.people += Number(d.people) || 0;
      groups.set(label, g);
    });

    summaryTotalEl.textContent = `${rows.length}건`;
    if (!rows.length) {
      summaryBodyEl.innerHTML = `<p class="check-status-line">아직 오늘 체크인된 티켓이 없습니다.</p>`;
      return;
    }
    summaryBodyEl.innerHTML = [...groups.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, g]) => field(label, `${g.count}건 · ${g.people}명`))
      .join("");
  } catch (err) {
    console.error("Today summary load failed:", err);
    summaryTotalEl.textContent = "-";
    summaryBodyEl.innerHTML = `<p class="check-status-line error">불러오는 중 오류가 발생했습니다.</p>`;
  }
}

function field(label, value) {
  return `<div class="check-field"><span class="check-label">${label}</span><span class="check-value">${value}</span></div>`;
}

function startScanner() {
  titleEl.textContent = "QR 스캔 대기 중";
  bodyEl.innerHTML = "";
  scanner = new Html5Qrcode("qr-reader");
  scanner
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 240 },
      (decodedText) => {
        scanner.stop().then(() => { scanner = null; handleToken(decodedText); }).catch(() => {});
      },
      () => {}
    )
    .catch((err) => {
      bodyEl.innerHTML = `<p class="check-status-line error">카메라를 열 수 없습니다. 권한을 확인해주세요.</p>`;
      console.error("Camera start failed:", err);
    });
}

async function handleToken(token) {
  titleEl.textContent = "티켓 확인 중...";
  try {
    // bookedBy로 더 이상 거르지 않습니다 — 여행사(B2B) 예약과, 결제 완료된
    // "티켓만" 직접 예약(reservation.js가 발급) 모두 qrToken만 있으면 여기서
    // 조회됩니다. qrToken이 없는 일반 예약은 규칙상 애초에 조회되지 않습니다.
    const q = query(
      collection(db, "reservations"),
      where("qrToken", "==", token),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      renderNotFound();
      return;
    }
    const docSnap = snap.docs[0];
    const data = docSnap.data();
    if (data.checkedIn) {
      renderAlreadyUsed(docSnap.id, data);
    } else if (data.paymentMethod === "cash_office" && data.status !== "confirmed") {
      // Cash @ Office는 관리자가 admin.html Settlement에서 실제 현금 수령을
      // 확인(status: pending → confirmed)하기 전까지 체크인시켜주지 않습니다.
      renderNotPaid(data);
    } else {
      renderReady(docSnap.id, data);
    }
  } catch (err) {
    console.error("Check lookup failed:", err);
    bodyEl.innerHTML = `<p class="check-status-line error">조회 중 오류가 발생했습니다.</p>`;
    renderRescanButton();
  }
}

function renderNotFound() {
  titleEl.textContent = "티켓을 찾을 수 없습니다";
  bodyEl.innerHTML = `<p class="check-status-line error">유효하지 않은 QR입니다.</p>`;
  renderRescanButton();
}

function renderAlreadyUsed(id, data) {
  titleEl.textContent = "이미 체크인됨";
  const usedAt = data.checkedInAt && data.checkedInAt.toDate ? data.checkedInAt.toDate().toLocaleString("ko-KR") : "-";
  bodyEl.innerHTML = `
    <p class="check-status-line warn">이미 사용된 티켓입니다.</p>
    ${field("투어", TOUR_NAMES[data.tourType] || data.tourType)}
    ${field("투어일", data.date)}
    ${field("인원", data.people + "명")}
    ${field("그룹명", data.name)}
    ${field("체크인 시간", usedAt)}
  `;
  renderRescanButton();
}

function renderNotPaid(data) {
  titleEl.textContent = "결제 확인 필요";
  bodyEl.innerHTML = `
    <p class="check-status-line warn">아직 현장 결제(보라카이션 오피스페이)가 확인되지 않았습니다.</p>
    ${field("투어", TOUR_NAMES[data.tourType] || data.tourType)}
    ${field("투어일", data.date)}
    ${field("인원", data.people + "명")}
    ${field("그룹명", data.name)}
    <p style="color:var(--muted); font-size:0.85rem; margin-top:12px;">관리자에게 현금 수령 확인을 요청한 후 다시 스캔해주세요.</p>
  `;
  renderRescanButton();
}

function renderReady(id, data) {
  titleEl.textContent = "WHALE SHARK TICKET";
  bodyEl.innerHTML = `
    ${field("투어", TOUR_NAMES[data.tourType] || data.tourType)}
    ${field("투어일", data.date)}
    ${field("인원", data.people + "명")}
    ${field("그룹명", data.name)}
    <div class="check-actions">
      <button class="check-btn check-btn-ok" id="btn-ok">체크인 완료</button>
      <button class="check-btn check-btn-cancel" id="btn-rescan">다시 스캔</button>
    </div>
    <div id="action-message"></div>
  `;
  document.getElementById("btn-ok").addEventListener("click", async () => {
    document.querySelectorAll(".check-btn").forEach(b => b.disabled = true);
    try {
      await updateDoc(doc(db, "reservations", id), { checkedIn: true, checkedInAt: serverTimestamp() });
      titleEl.textContent = "체크인 완료";
      bodyEl.innerHTML = `<p class="check-status-line ok">OK — 입장 처리되었습니다.</p>${field("인원", data.people + "명")}`;
      renderRescanButton();
    } catch (err) {
      console.error("Check-in failed:", err);
      document.getElementById("action-message").innerHTML = `<p class="portal-message error">처리 중 오류가 발생했습니다.</p>`;
      document.querySelectorAll(".check-btn").forEach(b => b.disabled = false);
    }
  });
  document.getElementById("btn-rescan").addEventListener("click", startScanner);
}

function renderRescanButton() {
  bodyEl.innerHTML += `<div class="modal-close-row" style="margin-top:16px; justify-content:center;"><button class="btn btn-small" id="btn-rescan-only">다시 스캔</button></div>`;
  document.getElementById("btn-rescan-only").addEventListener("click", startScanner);
}
