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
    vfMin: "VIP Fast Track can be booked for 2 or more people.",
    payRetry: "Your payment was not completed, so you have not been charged. Your details are saved — please tap Pay Now to try again. If your card keeps failing, try another card or GCash / Maya wallet.",
    inApp: "Tip: if payment fails inside Facebook / Instagram / KakaoTalk, open this page in Chrome or Safari and pay there.",
    mayaError: "Could not start Maya payment. Please try again."
  },
  ko: {
    fillFields: "필수 항목을 모두 입력해주세요.",
    vfMin: "VIP 패스트트랙은 2인 이상부터 예약 가능합니다.",
    payRetry: "결제가 완료되지 않아 요금은 청구되지 않았습니다. 입력하신 내용은 그대로 남아 있으니 결제하기를 다시 눌러주세요. 카드가 계속 안 되면 다른 카드나 GCash·Maya 지갑으로 결제해 주세요.",
    inApp: "안내: 페이스북·인스타그램·카카오톡 안에서 결제가 안 되면 크롬이나 사파리로 이 페이지를 열어 결제해 주세요.",
    mayaError: "Maya 결제를 시작하지 못했습니다. 다시 시도해주세요."
  },
  zh: {
    fillFields: "请填写所有必填项。",
    vfMin: "VIP快速通道需2人及以上方可预订。",
    payRetry: "支付未完成，未产生扣款。您填写的信息已保留，请再次点击立即支付。如银行卡多次失败，请换一张卡或使用 GCash / Maya 钱包。",
    inApp: "提示：如在 Facebook / Instagram / KakaoTalk 内无法支付，请用 Chrome 或 Safari 打开本页面再支付。",
    mayaError: "无法启动Maya支付，请重试。"
  },
  ja: {
    fillFields: "必須項目をすべて入力してください。",
    vfMin: "VIPファストトラックは2名様からご予約いただけます。",
    payRetry: "お支払いが完了しなかったため、料金は請求されていません。入力内容は保存されていますので、もう一度「お支払いへ」を押してください。カードが通らない場合は別のカード、または GCash / Maya ウォレットをお試しください。",
    inApp: "ヒント：Facebook・Instagram・KakaoTalk 内で決済できない場合は、Chrome または Safari でこのページを開いてお支払いください。",
    mayaError: "Maya決済を開始できませんでした。再度お試しください。"
  },
  ru: {
    fillFields: "Пожалуйста, заполните все обязательные поля.",
    vfMin: "VIP Fast Track можно забронировать от 2 человек.",
    payRetry: "Оплата не завершена, деньги не списаны. Ваши данные сохранены — нажмите «Перейти к оплате» ещё раз. Если карта не проходит, попробуйте другую карту или кошелёк GCash / Maya.",
    inApp: "Совет: если оплата не проходит внутри Facebook / Instagram / KakaoTalk, откройте страницу в Chrome или Safari.",
    mayaError: "Не удалось начать оплату через Maya. Попробуйте ещё раз."
  }
};

// VIP 패스트트랙은 전용 차량·전담 촬영이라 1인 예약은 받지 않는다.
// 투어를 VIP로 고르면 인원 칸의 최소값을 2로 올리고, 1로 되어 있으면 2로 맞춘다.
const VF_MIN_PEOPLE = 2;
function syncVfMinPeople() {
  const peopleEl = document.getElementById("people");
  const checked = document.querySelector('input[name="tourType"]:checked') ||
    document.querySelector('[name="tourType"]');
  if (!peopleEl || !checked) return;
  const isVF = (checked.value || "").trim() === "VF";
  peopleEl.min = isVF ? VF_MIN_PEOPLE : 1;
  if (isVF && Number(peopleEl.value) < VF_MIN_PEOPLE) {
    peopleEl.value = VF_MIN_PEOPLE;
    peopleEl.dispatchEvent(new Event("input", { bubbles: true }));
    peopleEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
document.querySelectorAll('[name="tourType"]').forEach(el => el.addEventListener("change", syncVfMinPeople));
document.getElementById("people")?.addEventListener("change", syncVfMinPeople);
syncVfMinPeople();
// ?tour=VF 로 들어오면 페이지 스크립트가 DOMContentLoaded에서 라디오를 고르므로 그 뒤에 한 번 더 맞춘다
document.addEventListener("DOMContentLoaded", syncVfMinPeople);

// ── 결제 실패·취소 후 되돌아오기 ──
// 예전에는 실패하면 무조건 메인 예약 페이지로 보내 입력 내용과 파트너(YEBO·FELIZ 등)
// 페이지가 사라졌다. 이제는 손님이 있던 페이지로 그대로 돌려보내고, 입력값을 복원한 뒤
// 결제 단계에서 다시 결제하도록 안내한다.
const RETRY_KEY = "ws_pay_retry";
// 유입 경로 — track.js가 손님 브라우저에 담아둔 값 (이번 방문 첫 페이지 / 7일 안 첫 방문)
const MALUMPATI_PRICE = 3600;
function readSource() {
  const get = (store, key) => { try { return JSON.parse(store.getItem(key) || "null"); } catch (_) { return null; } };
  const out = {};
  const last = get(sessionStorage, "ws_src");
  const first = get(localStorage, "ws_src_first");
  if (last) out.last = last;
  if (first && (!last || first.at !== last.at)) out.first = first;
  return out;
}
function returnUrl(result) {
  const u = new URL(window.location.href);
  u.hash = "";
  u.searchParams.set("payment", result);
  return u.toString();
}
function saveFormForRetry() {
  try {
    const values = {};
    form.querySelectorAll("input, select, textarea").forEach(el => {
      if (!el.name || el.type === "hidden" || el.type === "submit") return;
      if (el.type === "radio") { if (el.checked) values[el.name] = el.value; return; }
      if (el.type === "checkbox") { values[el.name] = el.checked; return; }
      values[el.name] = el.value;
    });
    localStorage.setItem(RETRY_KEY, JSON.stringify({ path: location.pathname, at: Date.now(), values }));
  } catch (_) {}
}
// 리마인드 메일의 "예약 마저 하기" 링크(?tour=VF&date=…&people=…)로 들어오면 값을 채워둔다
function prefillFromUrl() {
  const q = new URLSearchParams(location.search);
  const date = q.get("date"), people = q.get("people");
  const dateEl = document.getElementById("date"), peopleEl = document.getElementById("people");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && dateEl && !dateEl.value) {
    dateEl.value = date;
    if (dateEl._flatpickr) dateEl._flatpickr.setDate(date, true);
    dateEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (people && /^\d{1,2}$/.test(people) && peopleEl) {
    peopleEl.value = people;
    peopleEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
function restoreAfterFailedPayment() {
  const result = new URLSearchParams(location.search).get("payment");
  if (result !== "failed" && result !== "cancelled") return;
  const lang = localStorage.getItem("ws_lang") || "ko";
  const t = MSG[lang] || MSG.en;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(RETRY_KEY) || "null"); } catch (_) {}
  const fresh = saved && saved.path === location.pathname && Date.now() - saved.at < 3 * 60 * 60 * 1000;
  if (fresh) {
    Object.entries(saved.values).forEach(([name, val]) => {
      form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach(el => {
        if (el.type === "radio") el.checked = (el.value === val);
        else if (el.type === "checkbox") el.checked = !!val;
        else el.value = val;
      });
    });
    form.querySelectorAll("input, select").forEach(el => el.dispatchEvent(new Event("change", { bubbles: true })));
    if (window.goToStep) { try { window.goToStep(4); } catch (_) {} }
  }
  // 날짜 선택기(flatpickr)가 값을 다시 그리도록
  const dateEl = document.getElementById("date");
  if (fresh && dateEl && dateEl._flatpickr && dateEl.value) dateEl._flatpickr.setDate(dateEl.value, true);
  syncVfMinPeople();

  const banner = document.createElement("div");
  banner.className = "pay-retry-banner";
  banner.setAttribute("role", "alert");
  banner.style.cssText = "margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-size:.92rem;line-height:1.55;font-weight:600;";
  banner.textContent = t.payRetry;
  form.prepend(banner);
  if (statusEl) { statusEl.textContent = t.payRetry; statusEl.className = "form-status error"; }
  banner.scrollIntoView({ block: "center" });
}
// 페이스북·인스타그램·카카오톡 등 앱 안 브라우저는 카드 본인인증 창이 막히는 경우가 많다
function showInAppBrowserTip() {
  const ua = navigator.userAgent || "";
  if (!/FBAN|FBAV|FB_IAB|Instagram|KAKAOTALK|Line\/|NAVER\(inapp|; wv\)/i.test(ua)) return;
  const lang = localStorage.getItem("ws_lang") || "ko";
  const t = MSG[lang] || MSG.en;
  const row = document.querySelector(".pay-btn-row") || (statusEl && statusEl.parentNode);
  if (!row) return;
  const tip = document.createElement("p");
  tip.style.cssText = "margin:10px 0 0;font-size:.85rem;color:#b45309;line-height:1.5;";
  tip.textContent = t.inApp;
  row.after(tip);
}
document.addEventListener("DOMContentLoaded", () => {
  // 페이지 자체 스크립트(언어·투어 선택)가 끝난 뒤에 복원해야 덮어쓰이지 않는다
  setTimeout(() => { prefillFromUrl(); syncVfMinPeople(); restoreAfterFailedPayment(); showInAppBrowserTip(); }, 0);
});

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
  // 옵션: 고래상어 + 말룸파티 원데이 (패스트트랙·VIP만, 1인 3,600 PHP, 할인 없음) — js/addon.js와 같은 값
  const malumpati = (tourType === "F" || tourType === "VF") && formData.get("addonMalumpati") === "1";
  const addonPP = malumpati ? MALUMPATI_PRICE : 0;
  const totalPrice = pricePerPerson ? (pricePerPerson + addonPP) * people : null;

  const reservation = {
    tourType,
    date: formData.get("date"),
    people,
    // VIP는 리조트로 픽업 → 미팅 장소 = 리조트. 패스트트랙은 졸리비 집합이라 리조트를 받지 않는다.
    pickup: tourType === "VF" ? ((formData.get("pickupResort") || "").trim() || formData.get("pickup")) : formData.get("pickup"),
    resort: tourType !== "VF" ? "" : (formData.get("pickupResort") || "").trim(),
    meetingTime: (tourType === "R" || tourType === "F" || tourType === "VF") ? formData.get("meetingTime") : "",
    nationality,
    pricePerPerson,
    totalPrice,
    currency: "PHP",
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    emergencyContact: (formData.get("emergencyContact") || "").trim(),
    referralCode: (formData.get("referralCode") || "").trim() || referralCode,
    source: readSource(),
    ...(malumpati ? { malumpati: true, malumpatiPrice: MALUMPATI_PRICE } : {}),
    status: "pending",
    createdAt: serverTimestamp()
  };

  const valid = !!(reservation.tourType && reservation.date && reservation.pickup && reservation.nationality && reservation.name && reservation.email &&
    (reservation.tourType !== "VF" || reservation.resort));
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
  if (reservation.tourType === "VF" && reservation.people < VF_MIN_PEOPLE) {
    statusEl.textContent = t.vfMin;
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
          failure: returnUrl("failed"),
          cancel:  returnUrl("cancelled")
        },
        requestReferenceNumber: docRef.id,
        // 웹훅(functions/webhook/maya.js)이 success 페이지 없이도 바우처를 보낼 수 있게
        metadata: { ws: {
          tourType: reservation.tourType, date: reservation.date, people: reservation.people,
          pickup: reservation.pickup || '', meetingTime: reservation.meetingTime || '',
          nationality: reservation.nationality || '', totalPrice: reservation.totalPrice,
          currency: reservation.currency || 'PHP', lang: localStorage.getItem('ws_lang') || lang || 'en',
          malumpati: !!reservation.malumpati,
          path: location.pathname
        } }
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

    saveFormForRetry();
    if (window.wsTrack) {
      window.wsTrack('checkout', { tour: reservation.tourType, value: reservation.totalPrice });
      if (window.wsTrackEnabled) await new Promise(r => setTimeout(r, 300)); // 전송될 시간
    }
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
