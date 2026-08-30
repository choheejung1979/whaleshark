import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("reservation-form");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("form-status");

// 예약 확정 바우처 이메일 발송 + PayMongo QRPh 결제 생성/확인을 처리하는
// Google Apps Script 웹 앱 (Secret key는 여기 없고 Apps Script 안에만 있음).
const VOUCHER_ENDPOINT = "https://script.google.com/macros/s/AKfycbwkaT0m8W5Q0HEAH6aNGZqibNgfXkJzUGzp28Txo2RyOPEenGtmujWaS2EEgJu7dhz3/exec";
const VOUCHER_SECRET = "lA6grkC0pujbOn5B5ooSip3z9N-Wvwre";

// PayMongo Public key — Public key는 브라우저에 노출돼도 안전하게 설계된
// 키라 여기 직접 넣어도 됩니다 (Secret key는 절대 여기 넣으면 안 됨).
const PAYMONGO_PUBLIC_KEY = "pk_live_REoKKSMaQ8TE6uihC9jwtWiS";

// 바우처 이메일 발송 실패는 예약 자체를 막지 않아야 하므로 별도로 감쌉니다.
async function sendVoucherEmail(reservation) {
  try {
    await fetch(VOUCHER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: VOUCHER_SECRET,
        tourType: reservation.tourType,
        date: reservation.date,
        people: reservation.people,
        pickup: reservation.pickup,
        meetingTime: reservation.meetingTime,
        nationality: reservation.nationality,
        totalPrice: reservation.totalPrice,
        paymentStatus: reservation.paymentStatus,
        paymentMethod: reservation.paymentMethod,
        currency: reservation.currency,
        name: reservation.name,
        email: reservation.email,
        lang: localStorage.getItem('ws_lang') || 'ko'
      })
    });
  } catch (err) {
    console.error("Voucher email failed:", err);
  }
}

const MSG = {
  en: {
    fillFields: "Please fill in all required fields.",
    processing: "Processing Payment...",
    approving: "Approving payment...",
    error: "An error occurred during reservation. Please try again later.",
    payNow: "Confirm Reservation",
    qrGenerating: "Generating QR code...",
    qrWaiting: "Waiting for payment...",
    qrSucceeded: "Payment received! Confirming reservation...",
    qrFailed: "Payment failed or expired. Please try again.",
    qrError: "Could not start QR payment. Please try again or choose a different payment method."
  },
  ko: {
    fillFields: "필수 항목을 모두 입력해주세요.",
    processing: "결제 처리 중...",
    approving: "결제 승인 중...",
    error: "예약 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    payNow: "예약 확정하기",
    qrGenerating: "QR 코드 생성 중...",
    qrWaiting: "결제 대기 중...",
    qrSucceeded: "결제가 확인됐습니다! 예약을 확정하는 중...",
    qrFailed: "결제가 실패했거나 만료됐습니다. 다시 시도해주세요.",
    qrError: "QR 결제를 시작하지 못했습니다. 다시 시도하시거나 다른 결제 방법을 선택해주세요."
  }
};

// ---------------------------------------------------------------------------
// PayMongo QRPh — the amount-bearing Payment Intent is created server-side
// (Apps Script, holds the Secret key). Payment-method creation + attach only
// need the Public key, so those happen directly here in the browser.
// ---------------------------------------------------------------------------
async function callVoucherEndpoint(payload) {
  const res = await fetch(VOUCHER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: VOUCHER_SECRET, ...payload })
  });
  return res.json();
}

async function paymongoRequest(path, body) {
  const res = await fetch("https://api.paymongo.com/v1" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(PAYMONGO_PUBLIC_KEY + ":")
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json.errors && json.errors[0] && json.errors[0].detail) || "PayMongo error");
  }
  return json;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Runs the full QRPh flow: create intent -> create+attach payment method ->
// show QR -> poll until succeeded/failed. Resolves true on success, false if
// the user cancels or payment fails/expires.
async function runQrphFlow(amount, description, lang) {
  const t = MSG[lang] || MSG.en;
  const qrphBox = document.getElementById("qrph-box");
  const qrImg = document.getElementById("qrph-qr-img");
  const qrStatus = document.getElementById("qrph-status");
  const qrCancel = document.getElementById("qrph-cancel");

  qrphBox.style.display = "block";
  qrStatus.textContent = t.qrGenerating;
  qrImg.style.display = "none";

  let cancelled = false;
  const onCancel = () => { cancelled = true; };
  qrCancel.addEventListener("click", onCancel, { once: true });

  try {
    const created = await callVoucherEndpoint({ action: "createQrPayment", amount, description });
    if (!created.ok) throw new Error(created.error || "createQrPayment failed");
    if (cancelled) return false;

    const pm = await paymongoRequest("/payment_methods", { data: { attributes: { type: "qrph" } } });
    if (cancelled) return false;

    const attached = await paymongoRequest(`/payment_intents/${created.id}/attach`, {
      data: { attributes: { payment_method: pm.data.id, client_key: created.clientKey } }
    });
    if (cancelled) return false;

    const imageUrl = attached.data.attributes.next_action &&
      attached.data.attributes.next_action.code &&
      attached.data.attributes.next_action.code.image_url;
    if (!imageUrl) throw new Error("No QR image returned");

    qrImg.src = imageUrl;
    qrImg.style.display = "block";
    qrStatus.textContent = t.qrWaiting;

    // Poll status via Apps Script (status check requires the Secret key).
    while (!cancelled) {
      await sleep(3000);
      if (cancelled) break;
      const check = await callVoucherEndpoint({ action: "checkQrPaymentStatus", id: created.id });
      if (!check.ok) continue;
      if (check.status === "succeeded") {
        qrStatus.textContent = t.qrSucceeded;
        return true;
      }
      if (check.status === "payment_failed" || check.status === "cancelled") {
        qrStatus.textContent = t.qrFailed;
        return false;
      }
      // otherwise (awaiting_next_action / processing) keep polling
    }
    return false;
  } catch (err) {
    console.error("QRPh flow error:", err);
    qrStatus.textContent = t.qrError;
    return false;
  } finally {
    qrCancel.removeEventListener("click", onCancel);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lang = localStorage.getItem('ws_lang') || 'ko';
  const t = MSG[lang] || MSG.en;
  statusEl.textContent = "";
  statusEl.className = "form-status";

  const formData = new FormData(form);
  const tourType = formData.get("tourType").trim();
  const people = Number(formData.get("people"));
  const nationality = formData.get("nationality");
  const pricePerPerson = window.PRICES && window.PRICES[nationality] ? window.PRICES[nationality][tourType] : null;
  const totalPrice = pricePerPerson ? pricePerPerson * people : null;

  const reservation = {
    tourType,
    date: formData.get("date"),
    people,
    pickup: formData.get("pickup"),
    // Regular: shared meeting point, one of two departure times (customer's choice).
    // Fast Track / VIP Fast Track: also meet at 07:30, but it's fixed, not a choice.
    meetingTime: (tourType === "R" || tourType === "F" || tourType === "VF") ? formData.get("meetingTime") : "",
    nationality,
    pricePerPerson,
    totalPrice,
    currency: "PHP",
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    emergencyContact: (formData.get("emergencyContact") || "").trim(),
    status: "pending",
    createdAt: serverTimestamp()
  };

  if (!reservation.tourType || !reservation.date || !reservation.pickup || !reservation.nationality || !reservation.name || !reservation.email) {
    statusEl.textContent = t.fillFields;
    statusEl.classList.add("error");
    return;
  }

  // 결제 방법 — QR 결제(PayMongo QRPh, 실제 온라인 결제) / 현장결제(투어
  // 당일 미팅 장소에서 현금).
  const paymentChoice = formData.get("paymentChoice") || "qrph";

  if (paymentChoice === "qrph") {
    submitBtn.disabled = true;
    const paid = await runQrphFlow(
      reservation.totalPrice,
      `${reservation.tourType} tour - ${reservation.date}`,
      lang
    );
    document.getElementById("qrph-box").style.display = "none";
    submitBtn.disabled = false;
    if (!paid) return; // cancelled, failed, or expired — let them retry
    reservation.paymentStatus = 'paid';
    reservation.paymentMethod = 'QRPh';
  } else {
    reservation.paymentStatus = 'unpaid';
    reservation.paymentMethod = lang === 'ko' ? '현장결제' : 'On-Site';
  }

  submitBtn.disabled = true;
  submitBtn.textContent = t.processing;

  try {
    // Save to Firebase
    await addDoc(collection(db, "reservations"), reservation);

    // Send the confirmation voucher email (best-effort, doesn't block the flow)
    sendVoucherEmail(reservation);

    // Show the Confirm step, then redirect to the success page
    window.showConfirmStep && window.showConfirmStep();
    setTimeout(() => {
      form.reset();
      window.location.href = "success.html?nationality=" + encodeURIComponent(nationality);
    }, 1400);
  } catch (err) {
    console.error(err);
    statusEl.textContent = t.error;
    statusEl.classList.add("error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t.payNow;
  }
});
