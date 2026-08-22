const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("./firebaseAdmin");
const { requireRole, toIso, todayKey, isValidDateKey } = require("./util");

const CHECK_LOCATION = "리버타드";

function groupCode(groupId) {
  return `WH-${groupId.slice(-6).toUpperCase()}`;
}

// 그룹을 응답용으로 축약합니다. 판매처(seller) 정보와 고객 개인정보는 절대
// 포함하지 않습니다 — 애초에 이 시스템은 고객 개인정보를 저장하지 않으며, C는
// 어떤 경로로도 어느 판매처의 그룹인지 알 수 없어야 합니다.
function toPublicTicket(groupId, group) {
  return {
    groupCode: groupCode(groupId),
    visitDate: group.visitDate,
    partySize: group.partySize,
    usedAt: toIso(group.usedAt),
    checkLocation: group.checkLocation || null,
  };
}

// C가 QR을 스캔해서 여는 공개 페이지가 호출하는, 인증이 필요 없는 조회 함수.
// QR 안의 무작위 TOKEN 자체가 유일한 자격 증명입니다.
const getCheckStatus = onCall(async (request) => {
  const { token } = request.data || {};
  if (typeof token !== "string" || !token) {
    throw new HttpsError("invalid-argument", "token이 필요합니다.");
  }

  const tokenSnap = await db.collection("qrTokens").doc(token).get();
  if (!tokenSnap.exists) {
    return { state: "NOT_FOUND" };
  }
  const tokenData = tokenSnap.data();
  if (tokenData.supersededBy) {
    return { state: "REISSUED" };
  }

  const groupSnap = await db.collection("ticketGroups").doc(tokenData.groupId).get();
  if (!groupSnap.exists) {
    return { state: "NOT_FOUND" };
  }
  const group = groupSnap.data();
  const ticket = toPublicTicket(groupSnap.id, group);

  if (group.status === "CANCELLED") {
    return { state: "CANCELLED", ticket };
  }
  if (group.status === "USED") {
    return { state: "ALREADY_USED", ticket };
  }
  return { state: "READY", ticket };
});

// C가 OK/CANCEL 버튼을 눌렀을 때 호출하는, 인증이 필요 없는 처리 함수.
const checkInAction = onCall(async (request) => {
  const { token, action, reason } = request.data || {};
  if (typeof token !== "string" || !token) {
    throw new HttpsError("invalid-argument", "token이 필요합니다.");
  }
  if (action !== "OK" && action !== "CANCEL") {
    throw new HttpsError("invalid-argument", "action은 OK 또는 CANCEL이어야 합니다.");
  }

  const result = await db.runTransaction(async (tx) => {
    const tokenRef = db.collection("qrTokens").doc(token);
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 티켓입니다.");
    }
    const tokenData = tokenSnap.data();
    if (tokenData.supersededBy) {
      throw new HttpsError("failed-precondition", "재발급된 QR입니다. 최신 QR을 사용해주세요.");
    }

    const groupRef = db.collection("ticketGroups").doc(tokenData.groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 그룹입니다.");
    }
    const group = groupSnap.data();

    if (group.status === "CANCELLED") {
      throw new HttpsError("failed-precondition", "판매처에서 취소된 티켓입니다.");
    }

    if (action === "OK") {
      if (group.status === "USED") {
        throw new HttpsError("already-exists", "이미 사용된 티켓입니다.");
      }

      tx.update(groupRef, {
        status: "USED",
        usedAt: FieldValue.serverTimestamp(),
        checkLocation: CHECK_LOCATION,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(db.collection("sellers").doc(group.sellerId), {
        usedCount: FieldValue.increment(group.partySize),
      });
      tx.set(
        db.collection("dailyCounts").doc(group.visitDate),
        { qrCheckinCount: FieldValue.increment(group.partySize) },
        { merge: true }
      );
      tx.set(db.collection("checkinLogs").doc(), {
        groupId: groupRef.id,
        qrToken: token,
        result: "OK",
        reason: null,
        checkedAt: FieldValue.serverTimestamp(),
        checkLocation: CHECK_LOCATION,
      });

      const nowIso = new Date().toISOString();
      return {
        state: "OK",
        ticket: {
          groupCode: groupCode(groupRef.id),
          visitDate: group.visitDate,
          partySize: group.partySize,
          usedAt: nowIso,
          checkLocation: CHECK_LOCATION,
        },
      };
    }

    // action === 'CANCEL' — 현장에서의 거부 결정을 기록만 합니다. 단순 삭제가 아니라
    // 누가/언제/어디서 CANCEL했는지 로그를 남기는 것이 목적이며, 그룹 자체의 최종
    // 취소(잔여 티켓 복구)는 판매처(B)만 수행할 수 있습니다.
    tx.set(db.collection("checkinLogs").doc(), {
      groupId: groupRef.id,
      qrToken: token,
      result: "CANCEL",
      reason: reason || "기타",
      checkedAt: FieldValue.serverTimestamp(),
      checkLocation: CHECK_LOCATION,
    });

    return { state: "CANCEL_LOGGED" };
  });

  return result;
});

// C(또는 A)가 특정 날짜의 QR 체크인 합계 / 실물 카운트 / 차이를 조회합니다.
const getDailyCounter = onCall(async (request) => {
  requireRole(request, "A", "C");
  const date = (request.data && request.data.date) || todayKey();
  if (!isValidDateKey(date)) {
    throw new HttpsError("invalid-argument", "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).");
  }

  const snap = await db.collection("dailyCounts").doc(date).get();
  const data = snap.exists ? snap.data() : {};
  const qrCheckinCount = data.qrCheckinCount || 0;
  const physicalCount = typeof data.physicalCount === "number" ? data.physicalCount : null;

  return {
    date,
    qrCheckinCount,
    physicalCount,
    difference: physicalCount === null ? null : physicalCount - qrCheckinCount,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
  };
});

// C가 리버타드 현장에서 육안으로 센 실물 인원 수를 입력합니다.
const setPhysicalCount = onCall(async (request) => {
  requireRole(request, "A", "C");
  const { date, count } = request.data || {};
  if (!isValidDateKey(date)) {
    throw new HttpsError("invalid-argument", "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).");
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new HttpsError("invalid-argument", "실물 카운트는 0 이상의 정수여야 합니다.");
  }

  await db.collection("dailyCounts").doc(date).set(
    {
      physicalCount: count,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    },
    { merge: true }
  );

  return { ok: true };
});

module.exports = {
  getCheckStatus,
  checkInAction,
  getDailyCounter,
  setPhysicalCount,
};
