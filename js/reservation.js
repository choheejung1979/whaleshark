import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("reservation-form");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("form-status");

// 예약 확정 바우처 이메일 발송용 Google Apps Script 웹 앱.
const VOUCHER_ENDPOINT = "https://script.google.com/macros/s/AKfycbwkaT0m8W5Q0HEAH6aNGZqibNgfXkJzUGzp28Txo2RyOPEenGtmujWaS2EEgJu7dhz3/exec";
const VOUCHER_SECRET = "lA6grkC0pujbOn5B5ooSip3z9N-Wvwre";

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
    payNow: "Confirm Reservation"
  },
  ko: {
    fillFields: "필수 항목을 모두 입력해주세요.",
    processing: "결제 처리 중...",
    approving: "결제 승인 중...",
    error: "예약 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    payNow: "예약 확정하기"
  }
};

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

  submitBtn.disabled = true;
  submitBtn.textContent = t.processing;

  try {
    // 1. Simulate API call to create the checkout session
    await new Promise(resolve => setTimeout(resolve, 1500));

    submitBtn.textContent = t.approving;
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Add payment info
    // ko: on-site payment only, no choice shown. en: guest picks GCash (paid
    // now) or Pay On-Site when they submit.
    if (lang === 'ko') {
      reservation.paymentStatus = 'unpaid';
      reservation.paymentMethod = '현장결제';
    } else {
      const paymentChoice = formData.get("paymentChoice") || "gcash";
      if (paymentChoice === "gcash") {
        reservation.paymentStatus = 'paid';
        reservation.paymentMethod = 'GCash';
      } else {
        reservation.paymentStatus = 'unpaid';
        reservation.paymentMethod = 'On-Site';
      }
    }

    // 3. Save to Firebase
    await addDoc(collection(db, "reservations"), reservation);

    // 4. Send the confirmation voucher email (best-effort, doesn't block the flow)
    sendVoucherEmail(reservation);

    // 5. Show the Confirm step, then redirect to the success page
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
