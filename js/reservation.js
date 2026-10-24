import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  query,
  where,
  getDocs,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("reservation-form");
const allPayBtns = document.querySelectorAll('.pay-now-btn');
const statusEl = document.getElementById("form-status");

const referralCode = new URLSearchParams(window.location.search).get('ref') || '';

const VOUCHER_ENDPOINT = "https://script.google.com/macros/s/AKfycbzTPR3kwrarZUs7_H8Eta094STF_xmIN7BVyF-6JLhg7KMTQgG4DUbbRBwFVqxa3F0k/exec";
const VOUCHER_SECRET = "lA6grkC0pujbOn5B5ooSip3z9N-Wvwre";
const MAYA_PUBLIC_KEY = "pk-Mg5rAp2ihXYPPBDNXxrqhdGwTCGUV3hjEcOC3hNHRis";
const MAYA_CHECKOUT_URL = "https://pg.paymaya.com/checkout/v1/checkouts";

const MSG = {
  en: {
    fillFields: "Please fill in all required fields.",
    mayaError: "Could not start Maya payment. Please try again."
  },
  ko: {
    fillFields: "필수 항목을 모두 입력해주세요.",
    mayaError: "Maya 결제를 시작하지 못했습니다. 다시 시도해주세요."
  },
  zh: {
    fillFields: "请填写所有必填项。",
    mayaError: "无法启动Maya支付，请重试。"
  },
  ja: {
    fillFields: "必須項目をすべて入力してください。",
    mayaError: "Maya決済を開始できませんでした。再度お試しください。"
  }
};

async function callVoucherEndpoint(payload) {
  const body = JSON.stringify({ secret: VOUCHER_SECRET, ...payload });
  const opts = { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body };
  const res = await fetch(VOUCHER_ENDPOINT, opts);
  const text = await res.text();
  if (text.trim().startsWith('<') && res.url && res.url !== VOUCHER_ENDPOINT) {
    const res2 = await fetch(res.url, opts);
    return res2.json();
  }
  return JSON.parse(text);
}

function getReservationData() {
  const lang = localStorage.getItem('ws_lang') || 'ko';
  const t = MSG[lang] || MSG.en;
  const formData = new FormData(form);
  const tourType = formData.get("tourType").trim();
  const people = Number(formData.get("people"));
  const nationality = formData.get("nationality");
  const basePricePerPerson = window.PRICES && window.PRICES[nationality] ? window.PRICES[nationality][tourType] : null;
  const refCodeVal = (formData.get("referralCode") || "").trim() || referralCode;
  const discountPP = window.getDiscountPerPerson ? window.getDiscountPerPerson(refCodeVal, tourType) : 0;
  const pricePerPerson = basePricePerPerson ? basePricePerPerson - discountPP : null;
  const totalPrice = pricePerPerson ? pricePerPerson * people : null;

  const reservation = {
    tourType,
    date: formData.get("date"),
    people,
    pickup: formData.get("pickup"),
    resort: (formData.get("pickupResort") || "").trim(),
    meetingTime: (tourType === "R" || tourType === "F" || tourType === "VF") ? formData.get("meetingTime") : "",
    nationality,
    pricePerPerson,
    totalPrice,
    currency: "PHP",
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    emergencyContact: (formData.get("emergencyContact") || "").trim(),
    referralCode: (formData.get("referralCode") || "").trim() || referralCode,
    status: "pending",
    createdAt: serverTimestamp()
  };

  const valid = !!(reservation.tourType && reservation.date && reservation.pickup && reservation.nationality && reservation.name && reservation.email);
  return { reservation, lang, t, valid };
}

// 카드(Maya) 결제
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { reservation, lang, t, valid } = getReservationData();
  statusEl.textContent = "";
  statusEl.className = "form-status";

  if (!valid) {
    statusEl.textContent = t.fillFields;
    statusEl.classList.add("error");
    return;
  }

  // 예보 폼은 결제 버튼 클래스가 달라 allPayBtns에 잡히지 않는다. 누른 버튼을
  // 따로 잠가야 두 번 눌러 예약이 중복 생성되는 일을 막을 수 있다.
  const clickedBtn = e.submitter;
  allPayBtns.forEach(b => { b.disabled = true; });
  if (clickedBtn) {
    clickedBtn.disabled = true;
    clickedBtn.classList.add('loading');
  }

  try {
    reservation.paymentStatus = 'pending';
    reservation.paymentMethod = 'Maya';
    reservation.selectedPaymentMethod = 'card';
    const docRef = await addDoc(collection(db, "reservations"), reservation);

    if (reservation.referralCode) {
      try {
        const refSnap = await getDocs(query(collection(db, "referralCodes"), where("code", "==", reservation.referralCode)));
        if (!refSnap.empty) await updateDoc(refSnap.docs[0].ref, { usageCount: increment(1) });
      } catch (_) {}
    }

    const parts = reservation.name.trim().split(' ');
    const mayaRes = await fetch(MAYA_CHECKOUT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + btoa(MAYA_PUBLIC_KEY + ":")
      },
      body: JSON.stringify({
        totalAmount: { value: reservation.totalPrice, currency: "PHP" },
        buyer: {
          firstName: parts[0],
          lastName: parts.slice(1).join(' ') || '-',
          contact: { email: reservation.email, phone: reservation.emergencyContact || '' }
        },
        items: [{
          name: `${reservation.tourType} tour - ${reservation.date}`,
          quantity: 1,
          totalAmount: { value: reservation.totalPrice, currency: "PHP" }
        }],
        redirectUrl: {
          success: "https://boracaywhaleshark.com/success?maya=1",
          failure: "https://boracaywhaleshark.com/reservation?payment=failed",
          cancel:  "https://boracaywhaleshark.com/reservation?payment=cancelled"
        },
        requestReferenceNumber: docRef.id
      })
    });
    const maya = await mayaRes.json();
    if (!maya.checkoutId) throw new Error("Maya: " + (maya.message || JSON.stringify(maya)));

    try { await updateDoc(doc(db, "reservations", docRef.id), { checkoutId: maya.checkoutId }); } catch (_) {}

    localStorage.setItem('maya_pending', JSON.stringify({
      checkoutId: maya.checkoutId,
      reservationId: docRef.id,
      nationality: reservation.nationality,
      reservation: { ...reservation, createdAt: null }
    }));

    window.location.href = maya.redirectUrl;
  } catch (err) {
    console.error(err);
    statusEl.textContent = String(err.message || err || t.mayaError);
    statusEl.classList.add("error");
    allPayBtns.forEach(b => { b.disabled = false; });
    if (clickedBtn) {
      clickedBtn.disabled = false;
      clickedBtn.classList.remove('loading');
    }
  }
});
