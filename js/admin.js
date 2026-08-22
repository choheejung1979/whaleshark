import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
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

// Real Firebase Authentication — replaces the old client-side-only PIN check,
// which never satisfied Firestore's `request.auth != null` rule anyway.
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginOverlay.style.display = "none";
    dashboard.style.display = "block";
    loadReservations();
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

// Load Data from Firestore
async function loadReservations() {
  tbody.innerHTML = "<tr><td colspan='11' style='text-align:center;'>로딩 중...</td></tr>";
  try {
    const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    let total = 0;
    let pending = 0;
    let confirmed = 0;
    
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
          ${data.paymentMethod ? `<div style="font-size:0.75rem; color:#10b981; margin-top:4px;">${data.paymentMethod}</div>` : ''}
          ${data.balanceDue ? `<div style="font-size:0.75rem; color:var(--admin-warning); margin-top:4px; font-weight:700;">잔금 ${data.balanceDue.toLocaleString()} 현장결제</div>` : ''}
        </td>
        <td>${data.people}명</td>
        <td>${data.nationality === "PH" ? "필리핀" : data.nationality === "FOREIGN" ? "외국인" : "-"}</td>
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
    });

    if (total === 0) {
      tbody.innerHTML = "<tr><td colspan='11' style='text-align:center;'>예약 내역이 없습니다.</td></tr>";
    }

    statTotal.textContent = total;
    statPending.textContent = pending;
    statConfirmed.textContent = confirmed;

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

function buildVoucherPreviewHtml(data) {
  const tour = VOUCHER_TOURS[data.tourType] || VOUCHER_TOURS.F;
  const isPaid = data.paymentStatus === 'paid';

  const confirmBox = isPaid
    ? `<div style="margin-top:20px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;font-size:13px;color:#166534;font-weight:700;">✓ 결제 완료 (${data.paymentMethod || '-'})</div>`
    : `<div style="margin-top:20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;font-weight:700;">현장결제 예정 (${data.paymentMethod || '현장결제'})</div>`;

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
