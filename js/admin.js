import { db, auth, firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  collection,
  query,
  orderBy,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// DOM Elements
const loginOverlay = document.getElementById("login-overlay");
const dashboard = document.getElementById("dashboard");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const refreshBtn = document.getElementById("refresh-btn");

const tbody = document.getElementById("reservation-tbody");
const statTotal = document.getElementById("stat-total");
const statPending = document.getElementById("stat-pending");
const statConfirmed = document.getElementById("stat-confirmed");

const voucherModal = document.getElementById("voucher-modal");
const voucherModalBody = document.getElementById("voucher-modal-body");
const voucherModalClose = document.getElementById("voucher-modal-close");
const reservationsById = {}; // id -> Firestore data, populated by loadReservations()

// =====================================================================
// 푸시 알림 — Cloud Functions 없이, 관리자 브라우저가 직접 Expo Push API를
// 호출합니다(관리자가 확정 버튼을 누르는 순간이 곧 "이벤트 발생 시점"이라
// 서버 트리거가 따로 필요 없습니다). 예약에 저장된 pushToken(앱에서 예약할
// 때 자동으로 붙음)이 있을 때만 보내고, 없으면 조용히 무시합니다.
// =====================================================================
async function sendExpoPush(messages) {
  const list = messages.filter((m) => m && m.to);
  if (!list.length) return;
  // Expo의 푸시 API는 한 번 요청에 최대 100건까지만 받아줘서, 그보다 많으면
  // 100개씩 잘라 나눠 보냅니다.
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
    } catch (err) {
      console.error("Push send failed:", err);
    }
  }
}

function notifyReservationConfirmed({ pushToken, date, tourType }) {
  if (!pushToken) return;
  const tourName = TOUR_NAMES_FOR_SETTLEMENT[tourType] || tourType || "";
  sendExpoPush([{
    to: pushToken,
    title: "🐋 예약이 확정되었습니다",
    body: `${date || ""} ${tourName} 예약이 확정됐어요!`.trim(),
  }]);
}

// Real Firebase Authentication — replaces the old client-side-only PIN check,
// which never satisfied Firestore's `request.auth != null` rule anyway.
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginOverlay.style.display = "none";
    dashboard.style.display = "block";
    loadReservations();
    loadDashboard();
  } else {
    loginOverlay.style.display = "flex";
    dashboard.style.display = "none";
  }
});

loginBtn.addEventListener("click", async () => {
  loginError.style.display = "none";
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
  } catch (err) {
    console.error("Login failed:", err);
    loginError.style.display = "block";
    passwordInput.value = "";
  }
});

[emailInput, passwordInput].forEach(el => {
  el.addEventListener("keyup", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
  emailInput.value = "";
  passwordInput.value = "";
});

refreshBtn.addEventListener("click", () => {
  loadReservations();
});

// Sidebar view switch — Dashboard / B2B Partners / Reservations / Products &
// Pricing / Deposit·Cash / Settlement / Reports.
const VIEW_LOADERS = {
  dashboard: loadDashboard,
  agencies: () => { loadAgencies(); },
  depositcash: loadDepositRequests,
  settlement: loadSettlement,
};

document.querySelectorAll(".nav-item[data-view]").forEach(navEl => {
  navEl.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-item[data-view]").forEach(el => el.classList.remove("active"));
    navEl.classList.add("active");
    const view = navEl.dataset.view;
    document.querySelectorAll(".admin-view").forEach(el => {
      el.style.display = el.id === `view-${view}` ? "block" : "none";
    });
    if (VIEW_LOADERS[view]) VIEW_LOADERS[view]();
  });
});

// Load Data from Firestore
async function loadReservations() {
  tbody.innerHTML = "<tr><td colspan='11' style='text-align:center;'>로딩 중...</td></tr>";
  try {
    const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    let total = 0;
    let pending = 0;
    let confirmed = 0;
    const recentRows = [];

    tbody.innerHTML = "";

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      reservationsById[id] = data;

      total++;
      if (data.status === "pending") pending++;
      if (data.status === "confirmed") confirmed++;
      
      const tr = document.createElement("tr");
      
      // Format Date
      let createdDate = "N/A";
      if (data.createdAt) {
        const d = data.createdAt.toDate();
        createdDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
      
      // Tour Type Mapping
      let tourName = data.tourType;
      if (tourName === "VF") tourName = "VIP패스트트랙";
      if (tourName === "F") tourName = "패스트트랙";
      if (tourName === "R") tourName = "레귤러 고래상어투어";
      if (tourName === "T") tourName = "고래상어 티켓만";

      // Status Select
      const selectHtml = `
        <div class="badge ${data.status}">
          <select class="status-select" data-id="${id}">
            <option value="pending" ${data.status === "pending" ? "selected" : ""}>대기중</option>
            <option value="confirmed" ${data.status === "confirmed" ? "selected" : ""}>예약확정</option>
            <option value="cancelled" ${data.status === "cancelled" ? "selected" : ""}>취소됨</option>
          </select>
        </div>
      `;

      tr.innerHTML = `
        <td>
          <div style="font-weight: 600;">${data.date}</div>
          <div style="font-size: 0.8rem; color: var(--admin-text-muted);">신청: ${createdDate}</div>
        </td>
        <td style="font-weight: bold;">${data.name}</td>
        <td>${tourName}</td>
        <td>
          <div class="badge ${data.paymentStatus === 'paid' ? 'confirmed' : 'pending'}">
            ${data.paymentStatus === 'paid' ? '결제완료' : '미결제'}
          </div>
          ${data.paymentMethod ? `<div style="font-size:0.75rem; color:#10b981; margin-top:4px;">${paymentMethodLabel(data.paymentMethod)}</div>` : ''}
          ${data.balanceDue ? `<div style="font-size:0.75rem; color:var(--admin-warning); margin-top:4px; font-weight:700;">잔금 ${data.balanceDue.toLocaleString()} 현장결제</div>` : ''}
        </td>
        <td>${data.people}명</td>
        <td>${{ PH: "필리핀", CN: "중국인", KR: "한국인", FOREIGN: "외국인" }[data.nationality] || "-"}</td>
        <td>
          <div>${data.email}</div>
        </td>
        <td>${data.emergencyContact || "-"}</td>
        <td>${data.meetingTime ? data.meetingTime + " AM" : "-"}</td>
        <td>${selectHtml}</td>
        <td>
          <button class="action-btn action-btn--voucher voucher-btn" data-id="${id}">바우처 보기</button>
          <button class="action-btn delete-btn" data-id="${id}">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);

      if (recentRows.length < 10) {
        recentRows.push(`<tr><td>${data.date}</td><td>${data.name}</td><td>${tourName}</td><td><span class="badge ${data.status}" style="display:inline-block;">${data.status}</span></td></tr>`);
      }
    });

    if (total === 0) {
      tbody.innerHTML = "<tr><td colspan='11' style='text-align:center;'>예약 내역이 없습니다.</td></tr>";
    }

    statTotal.textContent = total;
    statPending.textContent = pending;
    statConfirmed.textContent = confirmed;

    const dashTotal = document.getElementById("dash-stat-total");
    const dashPending = document.getElementById("dash-stat-pending");
    const dashRecent = document.getElementById("dashboard-recent-tbody");
    if (dashTotal) dashTotal.textContent = total;
    if (dashPending) dashPending.textContent = pending;
    if (dashRecent) {
      dashRecent.innerHTML = recentRows.length
        ? recentRows.join("")
        : "<tr><td colspan='4' style='text-align:center;'>예약 내역이 없습니다.</td></tr>";
    }

    attachEventListeners();

  } catch (error) {
    console.error("Error loading reservations: ", error);
    tbody.innerHTML = "<tr><td colspan='11' style='text-align:center; color: red;'>데이터를 불러오는 중 오류가 발생했습니다.</td></tr>";
  }
}

// Voucher Preview — mirrors the layout of the actual voucher email
// (Code.gs), rendered from the reservation data already in Firestore.
const VOUCHER_TOURS = {
  VF: { color: '#a855f7', name: 'VIP Fast Track' },
  F: { color: '#f97316', name: 'Fast Track' },
  R: { color: '#3b82f6', name: 'Regular Tour' },
  T: { color: '#10b981', name: 'Ticket Only' }
};

function fmtVoucherMoney(amount, currency) {
  const n = Number(amount) || 0;
  return `${currency || 'PHP'} ${n.toLocaleString('en-US')}`;
}

function paymentMethodLabel(method) {
  return method === 'cash_office' ? '보라카이션 오피스페이' : method;
}

function buildVoucherPreviewHtml(data) {
  const tour = VOUCHER_TOURS[data.tourType] || VOUCHER_TOURS.F;
  const isPaid = data.paymentStatus === 'paid';

  const confirmBox = isPaid
    ? `<div style="margin-top:20px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;font-size:13px;color:#166534;font-weight:700;">✓ 결제 완료 (${paymentMethodLabel(data.paymentMethod) || '-'})</div>`
    : `<div style="margin-top:20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;font-weight:700;">현장결제 예정 (${paymentMethodLabel(data.paymentMethod) || '현장결제'})</div>`;

  const meetingBlock = data.meetingTime
    ? `<div style="margin-top:20px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">미팅 시간</div>
        <div style="font-size:15px;font-weight:700;color:#0f172a;">${data.meetingTime} AM</div>
      </div>`
    : '';

  return `
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.12);font-family:'Helvetica Neue',Arial,sans-serif;">
      <tr><td>
        <div style="padding:24px 28px;background:${tour.color};">
          <table role="presentation" style="width:100%;"><tr>
            <td style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:0.5px;">BORACAY WHALE SHARK</td>
            <td style="text-align:right;color:rgba(255,255,255,0.85);font-size:12px;font-weight:700;letter-spacing:1px;">E-VOUCHER</td>
          </tr></table>
        </div>
      </td></tr>
      <tr><td style="padding:28px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">투어</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:20px;">${tour.name}</div>
        <table style="width:100%;border-top:1px dashed #cbd5e1;border-bottom:1px dashed #cbd5e1;border-collapse:collapse;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="width:50%;padding:12px 0;vertical-align:top;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">예약자</div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${data.name || '-'}</div>
            </td>
            <td style="width:50%;padding:12px 0;vertical-align:top;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">이메일</div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${data.email || '-'}</div>
            </td>
          </tr>
          <tr>
            <td style="width:50%;padding:12px 0;vertical-align:top;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">투어일</div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${data.date || '-'}</div>
            </td>
            <td style="width:50%;padding:12px 0;vertical-align:top;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">인원</div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${data.people || '-'}</div>
            </td>
          </tr>
          <tr>
            <td style="width:50%;padding:12px 0;vertical-align:top;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">픽업 장소</div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${data.pickup || '-'}</div>
            </td>
            <td style="width:50%;padding:12px 0;vertical-align:top;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">총 금액</div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${fmtVoucherMoney(data.totalPrice, data.currency)}</div>
            </td>
          </tr>
        </table>
        ${meetingBlock}
        ${confirmBox}
      </td></tr>
      <tr><td style="padding:18px 28px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">Boracay Whale Shark &middot; Libertad, Antique, Philippines</p>
      </td></tr>
    </table>
  `;
}

function openVoucherPreview(id) {
  const data = reservationsById[id];
  if (!data) return;
  voucherModalBody.innerHTML = buildVoucherPreviewHtml(data);
  voucherModal.classList.add("open");
}

function closeVoucherPreview() {
  voucherModal.classList.remove("open");
}

voucherModalClose.addEventListener("click", closeVoucherPreview);
voucherModal.querySelector(".voucher-modal-backdrop").addEventListener("click", closeVoucherPreview);

// Action Event Listeners
function attachEventListeners() {
  // Voucher preview
  document.querySelectorAll(".voucher-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      openVoucherPreview(e.target.getAttribute("data-id"));
    });
  });

  // Status Change
  const selects = document.querySelectorAll(".status-select");
  selects.forEach(select => {
    select.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      const newStatus = e.target.value;
      const badgeDiv = e.target.parentElement;
      
      // Update badge class visually immediately
      badgeDiv.className = `badge ${newStatus}`;

      try {
        await updateDoc(doc(db, "reservations", id), {
          status: newStatus
        });
        if (newStatus === "confirmed") {
          notifyReservationConfirmed(reservationsById[id] || {});
        }
        // Update stats
        loadReservations();
      } catch (err) {
        console.error("Error updating status: ", err);
        alert("상태 업데이트에 실패했습니다.");
      }
    });
  });

  // Delete
  const deleteBtns = document.querySelectorAll(".delete-btn");
  deleteBtns.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      if (confirm("정말로 이 예약을 삭제하시겠습니까? 복구할 수 없습니다.")) {
        const id = e.target.getAttribute("data-id");
        try {
          await deleteDoc(doc(db, "reservations", id));
          loadReservations();
        } catch (err) {
          console.error("Error deleting reservation: ", err);
          alert("삭제에 실패했습니다.");
        }
      }
    });
  });
}

// =====================================================================
// 에이전시 관리 (B2B) — Cloud Functions 없이, 관리자 브라우저 세션에서
// 직접 처리합니다. 새 에이전시 계정 생성은 "보조 Firebase 앱 인스턴스"를
// 써서 관리자 자신의 로그인 세션이 끊기지 않게 합니다 — 기본 auth 객체로
// createUserWithEmailAndPassword를 호출하면 그 즉시 새로 만든 계정으로
// 로그인되어버려 관리자가 로그아웃되기 때문입니다.
// =====================================================================
function fmtPeso(amount) {
  return `₱${(Number(amount) || 0).toLocaleString('en-US')}`;
}

function randomTempPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, "").slice(0, 20) + "!1";
}

async function loadAgencies() {
  const tbody = document.getElementById("agency-tbody");
  tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>로딩 중...</td></tr>";
  try {
    const [agenciesSnap, reservationsSnap] = await Promise.all([
      getDocs(collection(db, "agencies")),
      getDocs(query(collection(db, "reservations"), orderBy("createdAt", "desc")))
    ]);

    // agencyId -> 정산 필요(depositApplied === false) 건수
    const pendingSettlement = {};
    reservationsSnap.forEach(docSnap => {
      const d = docSnap.data();
      if (d.bookedBy === "agency" && d.depositApplied === false) {
        pendingSettlement[d.agencyId] = (pendingSettlement[d.agencyId] || 0) + 1;
      }
    });

    let totalBalance = 0;
    let totalPending = 0;
    const rows = [];
    agenciesSnap.forEach(docSnap => {
      const a = docSnap.data();
      const uid = docSnap.id;
      const pending = pendingSettlement[uid] || 0;
      totalBalance += a.depositBalance || 0;
      totalPending += pending;
      rows.push(`
        <tr>
          <td style="font-weight:600;">${a.name}</td>
          <td>${a.email}</td>
          <td>${fmtPeso(a.depositBalance)}</td>
          <td>${pending > 0 ? `<span class="badge cancelled">${pending}건</span>` : '-'}</td>
          <td>
            <button class="action-btn topup-btn" data-uid="${uid}" data-name="${a.name}">입금 반영</button>
            <button class="action-btn deduct-btn" data-uid="${uid}" data-name="${a.name}" data-balance="${a.depositBalance || 0}" style="background: var(--admin-danger);">차감</button>
          </td>
        </tr>
      `);
    });

    tbody.innerHTML = rows.length
      ? rows.join("")
      : "<tr><td colspan='5' style='text-align:center;'>등록된 에이전시가 없습니다.</td></tr>";

    document.getElementById("agency-stat-count").textContent = agenciesSnap.size;
    document.getElementById("agency-stat-balance").textContent = fmtPeso(totalBalance);
    document.getElementById("agency-stat-pending").textContent = totalPending;

    const dashAgencies = document.getElementById("dash-stat-agencies");
    const dashBalance = document.getElementById("dash-stat-balance");
    const dashSettlement = document.getElementById("dash-stat-settlement");
    if (dashAgencies) dashAgencies.textContent = agenciesSnap.size;
    if (dashBalance) dashBalance.textContent = fmtPeso(totalBalance);
    if (dashSettlement) dashSettlement.textContent = totalPending;

    document.querySelectorAll(".topup-btn").forEach(btn => {
      btn.addEventListener("click", () => handleTopup(btn.dataset.uid, btn.dataset.name));
    });
    document.querySelectorAll(".deduct-btn").forEach(btn => {
      btn.addEventListener("click", () => handleDeduct(btn.dataset.uid, btn.dataset.name, Number(btn.dataset.balance)));
    });
  } catch (err) {
    console.error("Error loading agencies:", err);
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:red;'>불러오는 중 오류가 발생했습니다.</td></tr>";
  }
}

async function handleTopup(uid, name) {
  const input = prompt(`${name} 에 반영할 입금액을 입력하세요 (PHP):`);
  if (input === null) return;
  const amount = Number(input);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("올바른 금액을 입력해주세요.");
    return;
  }
  try {
    await updateDoc(doc(db, "agencies", uid), { depositBalance: increment(amount) });
    await addDoc(collection(db, "agencyTransactions"), {
      agencyId: uid,
      type: "topup",
      amount,
      note: "관리자 입금 반영",
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });
    loadAgencies();
  } catch (err) {
    console.error("Error recording top-up:", err);
    alert("입금 반영에 실패했습니다.");
  }
}

async function handleDeduct(uid, name, currentBalance) {
  const input = prompt(`${name} 에서 차감할 금액을 입력하세요 (PHP)\n현재 잔액: ${fmtPeso(currentBalance)}`);
  if (input === null) return;
  const amount = Number(input);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("올바른 금액을 입력해주세요.");
    return;
  }
  if (amount > currentBalance) {
    alert(`차감액이 현재 잔액(${fmtPeso(currentBalance)})보다 많습니다.`);
    return;
  }
  const note = prompt("차감 사유를 입력하세요 (예: 정산 오류 조정):", "관리자 차감") || "관리자 차감";
  try {
    await updateDoc(doc(db, "agencies", uid), { depositBalance: increment(-amount) });
    await addDoc(collection(db, "agencyTransactions"), {
      agencyId: uid,
      type: "deduction",
      amount: -amount,
      note,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });
    loadAgencies();
  } catch (err) {
    console.error("Error recording deduction:", err);
    alert("차감 처리에 실패했습니다.");
  }
}

document.getElementById("agency-create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("agency-name-input").value.trim();
  const email = document.getElementById("agency-email-input").value.trim();
  const msgEl = document.getElementById("agency-create-message");
  msgEl.textContent = "";

  // 보조 앱 인스턴스 — 매번 새로 만들고 끝나면 정리합니다 (관리자 세션 보호).
  const secondaryApp = initializeApp(firebaseConfig, `AgencyCreate-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, randomTempPassword());
    const uid = cred.user.uid;
    await sendPasswordResetEmail(secondaryAuth, email);
    await signOut(secondaryAuth);

    await setDoc(doc(db, "agencies", uid), {
      name,
      email,
      depositBalance: 0,
      active: true,
      createdAt: serverTimestamp()
    });

    msgEl.style.color = "var(--admin-success)";
    msgEl.textContent = `등록 완료 — ${email} 로 비밀번호 설정 메일을 보냈습니다.`;
    e.target.reset();
    loadAgencies();
  } catch (err) {
    console.error("Error creating agency:", err);
    msgEl.style.color = "var(--admin-danger)";
    msgEl.textContent = err.code === "auth/email-already-in-use"
      ? "이미 사용 중인 이메일입니다."
      : "등록에 실패했습니다.";
  }
});

// =====================================================================
// 오늘 투어 운영 상태 — 앱 홈 화면 히어로 영상 아래 배너에 그대로 반영되는
// settings/tourStatus 문서 하나만 계속 덮어씁니다(날짜별 기록 아님).
// =====================================================================
(async () => {
  try {
    const snap = await getDoc(doc(db, "settings", "tourStatus"));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById("tour-status-select").value = d.status || "operating";
      document.getElementById("tour-status-message-input").value = d.message || "";
    }
  } catch (err) {
    console.error("Failed to load tour status:", err);
  }
})();

document.getElementById("tour-status-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById("tour-status-message");
  msgEl.textContent = "";
  try {
    await setDoc(doc(db, "settings", "tourStatus"), {
      status: document.getElementById("tour-status-select").value,
      message: document.getElementById("tour-status-message-input").value.trim(),
      updatedAt: serverTimestamp()
    });
    msgEl.style.color = "var(--admin-success)";
    msgEl.textContent = "저장했습니다 — 앱 홈 화면에 바로 반영됩니다.";
  } catch (err) {
    console.error("Tour status save failed:", err);
    msgEl.style.color = "var(--admin-danger)";
    msgEl.textContent = "저장에 실패했습니다.";
  }
});

// =====================================================================
// 고래상어 출몰 알림 방송 — 예약 여부와 무관하게 앱을 한 번이라도 열어본
// 사람 전체(pushTokens 컬렉션)에게 보냅니다.
// =====================================================================
document.getElementById("sighting-broadcast-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("sighting-message-input");
  const msgEl = document.getElementById("sighting-broadcast-message");
  const message = input.value.trim();
  msgEl.textContent = "";
  if (!message) return;

  try {
    const snap = await getDocs(collection(db, "pushTokens"));
    const tokens = [];
    snap.forEach((d) => tokens.push(d.data().token));
    if (!tokens.length) {
      msgEl.style.color = "var(--admin-warning)";
      msgEl.textContent = "등록된 기기가 없습니다.";
      return;
    }
    await sendExpoPush(tokens.map((to) => ({ to, title: "🐋 Boracay Whale Shark", body: message })));
    msgEl.style.color = "var(--admin-success)";
    msgEl.textContent = `${tokens.length}개 기기로 발송했습니다.`;
    input.value = "";
  } catch (err) {
    console.error("Sighting broadcast failed:", err);
    msgEl.style.color = "var(--admin-danger)";
    msgEl.textContent = "발송에 실패했습니다.";
  }
});

// =====================================================================
// 입금 신청 승인/거절 — 파트너(에이전시)가 agency-portal.html에서 신청하면
// 여기서 확인하고 승인 시 잔액에 반영합니다.
// =====================================================================
async function loadDepositRequests() {
  const tbody = document.getElementById("deposit-request-tbody");
  tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>로딩 중...</td></tr>";
  try {
    const snap = await getDocs(query(collection(db, "depositRequests"), orderBy("requestedAt", "desc")));
    const rows = [];
    snap.forEach(docSnap => {
      const r = docSnap.data();
      if (r.status !== "pending") return;
      const requestedDate = r.requestedAt ? r.requestedAt.toDate().toLocaleDateString("ko-KR") : "-";
      rows.push(`
        <tr>
          <td>${requestedDate}</td>
          <td style="font-weight:600;">${r.agencyName || r.agencyId}</td>
          <td>${fmtPeso(r.amount)}</td>
          <td>${r.note || "-"}</td>
          <td>
            <button class="action-btn" style="background: var(--admin-success);" data-action="approve" data-id="${docSnap.id}" data-uid="${r.agencyId}" data-amount="${r.amount}">승인</button>
            <button class="action-btn delete-btn" data-action="reject" data-id="${docSnap.id}">거절</button>
          </td>
        </tr>
      `);
    });
    tbody.innerHTML = rows.length
      ? rows.join("")
      : "<tr><td colspan='5' style='text-align:center;'>대기 중인 신청이 없습니다.</td></tr>";

    tbody.querySelectorAll("button[data-action='approve']").forEach(btn => {
      btn.addEventListener("click", () => handleDepositRequest(btn.dataset.id, btn.dataset.uid, Number(btn.dataset.amount), "approved"));
    });
    tbody.querySelectorAll("button[data-action='reject']").forEach(btn => {
      btn.addEventListener("click", () => handleDepositRequest(btn.dataset.id, null, 0, "rejected"));
    });
  } catch (err) {
    console.error("Error loading deposit requests:", err);
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:red;'>불러오는 중 오류가 발생했습니다.</td></tr>";
  }
}

async function handleDepositRequest(requestId, agencyUid, amount, decision) {
  if (decision === "approved" && !confirm(`${fmtPeso(amount)} 입금을 승인하고 잔액에 반영할까요?`)) return;
  if (decision === "rejected" && !confirm("이 입금 신청을 거절할까요?")) return;
  try {
    if (decision === "approved") {
      await updateDoc(doc(db, "agencies", agencyUid), { depositBalance: increment(amount) });
      await addDoc(collection(db, "agencyTransactions"), {
        agencyId: agencyUid,
        type: "topup",
        amount,
        note: "관리자 입금 승인",
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid
      });
    }
    await updateDoc(doc(db, "depositRequests", requestId), {
      status: decision,
      resolvedAt: serverTimestamp(),
      resolvedBy: auth.currentUser.uid
    });
    loadDepositRequests();
    loadAgencies();
  } catch (err) {
    console.error("Error resolving deposit request:", err);
    alert("처리에 실패했습니다.");
  }
}

// =====================================================================
// Dashboard — 예약/에이전시 데이터는 이미 loadReservations()/loadAgencies()가
// 불러오면서 dash-stat-* 요소도 같이 채웁니다. 여기서는 그 두 개를 한 번에
// 트리거만 합니다.
// =====================================================================
function loadDashboard() {
  loadReservations();
  loadAgencies();
}

// =====================================================================
// Settlement — (1) 에이전시 예약인데 잔액 차감이 안 끝난 것(depositApplied
// === false, 네트워크 끊김 등으로 2단계 트랜잭션이 중간에 멈춘 경우),
// (2) Cash @ Office로 예약해서 아직 현금을 못 받은 것(status === 'pending').
// =====================================================================
const TOUR_NAMES_FOR_SETTLEMENT = { VF: "VIP패스트트랙", F: "패스트트랙", R: "레귤러", T: "티켓", H: "호핑투어", L: "랜드투어" };

async function loadSettlement() {
  const depositTbody = document.getElementById("settlement-deposit-tbody");
  const cashTbody = document.getElementById("settlement-cash-tbody");
  depositTbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>로딩 중...</td></tr>";
  cashTbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>로딩 중...</td></tr>";
  try {
    const [reservationsSnap, agenciesSnap] = await Promise.all([
      getDocs(query(collection(db, "reservations"), orderBy("createdAt", "desc"))),
      getDocs(collection(db, "agencies"))
    ]);
    const agencyNames = {};
    agenciesSnap.forEach(d => { agencyNames[d.id] = d.data().name; });

    const depositRows = [];
    const cashRows = [];
    reservationsSnap.forEach(docSnap => {
      const d = docSnap.data();
      if (d.bookedBy !== "agency") return;
      const tourName = TOUR_NAMES_FOR_SETTLEMENT[d.tourType] || d.tourType;
      const agencyName = agencyNames[d.agencyId] || d.agencyId;

      if (d.paymentMethod !== "cash_office" && d.depositApplied === false) {
        depositRows.push(`
          <tr>
            <td>${d.date}</td>
            <td>${agencyName}</td>
            <td>${d.name}</td>
            <td>${fmtPeso(d.totalPrice)}</td>
            <td><span class="badge pending">잔액 차감 대기</span></td>
          </tr>
        `);
      }
      if (d.paymentMethod === "cash_office" && d.status === "pending") {
        cashRows.push(`
          <tr>
            <td>${d.date}</td>
            <td>${agencyName}</td>
            <td>${d.name}</td>
            <td>${fmtPeso(d.totalPrice)}</td>
            <td><button class="action-btn" style="background: var(--admin-success);" data-action="mark-collected" data-id="${docSnap.id}" data-date="${d.date}" data-tourtype="${d.tourType}" data-pushtoken="${d.pushToken || ""}">현금 수령 확인</button></td>
          </tr>
        `);
      }
    });

    depositTbody.innerHTML = depositRows.length ? depositRows.join("") : "<tr><td colspan='5' style='text-align:center;'>정산 필요 건이 없습니다.</td></tr>";
    cashTbody.innerHTML = cashRows.length ? cashRows.join("") : "<tr><td colspan='5' style='text-align:center;'>수금 대기 건이 없습니다.</td></tr>";

    cashTbody.querySelectorAll("button[data-action='mark-collected']").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("현금을 수령하셨나요? 예약 상태를 확정으로 바꿉니다.")) return;
        try {
          await updateDoc(doc(db, "reservations", btn.dataset.id), { status: "confirmed" });
          notifyReservationConfirmed({
            pushToken: btn.dataset.pushtoken,
            date: btn.dataset.date,
            tourType: btn.dataset.tourtype,
          });
          loadSettlement();
        } catch (err) {
          console.error("Error confirming cash collection:", err);
          alert("처리에 실패했습니다.");
        }
      });
    });
  } catch (err) {
    console.error("Error loading settlement data:", err);
    depositTbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:red;'>불러오는 중 오류가 발생했습니다.</td></tr>";
    cashTbody.innerHTML = "";
  }
}
