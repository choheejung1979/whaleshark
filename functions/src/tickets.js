const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("./firebaseAdmin");
const { randomToken, requireRole, requireOwnSellerOrAdmin, isValidDateKey } = require("./util");

const MAX_PARTY_SIZE = 500;

function assertPartySize(value) {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_PARTY_SIZE) {
    throw new HttpsError("invalid-argument", "인원 수가 올바르지 않습니다.");
  }
}

// A가 새 판매처(B)를 등록합니다.
const createSeller = onCall(async (request) => {
  requireRole(request, "A");
  const { sellerId, name } = request.data || {};
  if (typeof sellerId !== "string" || !/^[a-z0-9_-]{2,40}$/.test(sellerId)) {
    throw new HttpsError("invalid-argument", "sellerId는 영문 소문자/숫자/-/_ 조합이어야 합니다.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new HttpsError("invalid-argument", "판매처 이름이 필요합니다.");
  }

  const ref = db.collection("sellers").doc(sellerId);
  const snap = await ref.get();
  if (snap.exists) {
    throw new HttpsError("already-exists", "이미 존재하는 판매처 ID입니다.");
  }

  await ref.set({
    name: name.trim(),
    active: true,
    allocatedTotal: 0,
    consumedCount: 0,
    usedCount: 0,
    cancelledCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, sellerId };
});

// B가 A에게 티켓 추가 배정을 요청합니다.
const requestTickets = onCall(async (request) => {
  const token = requireRole(request, "B");
  const { requestedQty } = request.data || {};
  assertPartySize(requestedQty);

  const ref = await db.collection("purchaseRequests").add({
    sellerId: token.sellerId,
    requestedQty,
    status: "pending",
    requestedAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });

  return { id: ref.id };
});

// A가 구매 요청을 승인/거절합니다. 승인 시 판매처 배정량을 원자적으로 증가시킵니다.
const resolvePurchaseRequest = onCall(async (request) => {
  requireRole(request, "A");
  const { requestId, approve } = request.data || {};
  if (typeof requestId !== "string" || !requestId) {
    throw new HttpsError("invalid-argument", "requestId가 필요합니다.");
  }

  await db.runTransaction(async (tx) => {
    const reqRef = db.collection("purchaseRequests").doc(requestId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 요청입니다.");
    }
    const reqData = reqSnap.data();
    if (reqData.status !== "pending") {
      throw new HttpsError("failed-precondition", "이미 처리된 요청입니다.");
    }

    if (approve) {
      const sellerRef = db.collection("sellers").doc(reqData.sellerId);
      const sellerSnap = await tx.get(sellerRef);
      if (!sellerSnap.exists) {
        throw new HttpsError("not-found", "존재하지 않는 판매처입니다.");
      }
      tx.update(sellerRef, { allocatedTotal: FieldValue.increment(reqData.requestedQty) });
    }

    tx.update(reqRef, {
      status: approve ? "approved" : "rejected",
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: request.auth.uid,
    });
  });

  return { ok: true };
});

// A가 요청 없이 직접 판매처 배정량을 조정합니다 (양수/음수 모두 가능).
const allocateTickets = onCall(async (request) => {
  requireRole(request, "A");
  const { sellerId, delta } = request.data || {};
  if (typeof sellerId !== "string" || !sellerId) {
    throw new HttpsError("invalid-argument", "sellerId가 필요합니다.");
  }
  if (!Number.isInteger(delta) || delta === 0) {
    throw new HttpsError("invalid-argument", "delta는 0이 아닌 정수여야 합니다.");
  }

  const allocatedTotal = await db.runTransaction(async (tx) => {
    const sellerRef = db.collection("sellers").doc(sellerId);
    const sellerSnap = await tx.get(sellerRef);
    if (!sellerSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 판매처입니다.");
    }
    const seller = sellerSnap.data();
    const newAllocated = seller.allocatedTotal + delta;
    if (newAllocated < seller.consumedCount) {
      throw new HttpsError(
        "failed-precondition",
        "이미 배정/사용된 수량보다 적게 배정할 수 없습니다."
      );
    }
    tx.update(sellerRef, { allocatedTotal: newAllocated });
    return newAllocated;
  });

  return { ok: true, allocatedTotal };
});

// B(또는 대행하는 A)가 특정 투어 날짜의 그룹(총 인원)을 등록하고 QR을 발급합니다.
// 고객 개인정보는 전혀 다루지 않습니다 — QR은 "이 날짜에 이 인원 수만큼 입장 가능"이라는
// 집계 자격만 나타내며, 개별 고객 단위가 아닙니다. 같은 날짜에 여러 그룹을 따로
// 등록하는 것도 허용합니다 (예: 오전/오후 별도 팀).
const createGroup = onCall(async (request) => {
  const { sellerId, visitDate, partySize } = request.data || {};
  requireOwnSellerOrAdmin(request, sellerId);

  if (!isValidDateKey(visitDate)) {
    throw new HttpsError("invalid-argument", "방문일 형식이 올바르지 않습니다 (YYYY-MM-DD).");
  }
  assertPartySize(partySize);

  const result = await db.runTransaction(async (tx) => {
    const sellerRef = db.collection("sellers").doc(sellerId);
    const sellerSnap = await tx.get(sellerRef);
    if (!sellerSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 판매처입니다.");
    }
    const seller = sellerSnap.data();
    const remaining = seller.allocatedTotal - seller.consumedCount;
    if (remaining < partySize) {
      throw new HttpsError("failed-precondition", `잔여 티켓이 부족합니다 (잔여 ${remaining}장).`);
    }

    const groupRef = db.collection("ticketGroups").doc();
    const qrToken = randomToken("WHALE", 10);
    const qrTokenRef = db.collection("qrTokens").doc(qrToken);

    tx.set(groupRef, {
      sellerId,
      sellerName: seller.name,
      visitDate,
      partySize,
      status: "ISSUED",
      qrToken,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      cancelledAt: null,
      cancelReason: null,
      usedAt: null,
      checkLocation: null,
      createdBy: request.auth.uid,
    });
    tx.set(qrTokenRef, { groupId: groupRef.id, supersededBy: null });
    tx.update(sellerRef, { consumedCount: FieldValue.increment(partySize) });

    return { groupId: groupRef.id, qrToken };
  });

  return result;
});

// 그룹 수정 (인원/방문일). 인원이 늘어나면 잔여 티켓을 다시 확인합니다.
// 같은 QR 토큰이 그대로 유지되며, 스캔 시 최신 인원/날짜가 실시간으로 조회됩니다
// (수정했다고 QR을 반드시 재발급할 필요는 없습니다 — 재발급은 별도 액션입니다).
const updateGroup = onCall(async (request) => {
  const { groupId, visitDate, partySize } = request.data || {};
  if (typeof groupId !== "string" || !groupId) {
    throw new HttpsError("invalid-argument", "groupId가 필요합니다.");
  }

  await db.runTransaction(async (tx) => {
    const groupRef = db.collection("ticketGroups").doc(groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 그룹입니다.");
    }
    const group = groupSnap.data();
    requireOwnSellerOrAdmin(request, group.sellerId);

    if (group.status !== "ISSUED") {
      throw new HttpsError("failed-precondition", "발급 상태의 그룹만 수정할 수 있습니다.");
    }

    const updates = { updatedAt: FieldValue.serverTimestamp() };

    if (partySize !== undefined && partySize !== group.partySize) {
      assertPartySize(partySize);
      const delta = partySize - group.partySize;
      const sellerRef = db.collection("sellers").doc(group.sellerId);
      const sellerSnap = await tx.get(sellerRef);
      const seller = sellerSnap.data();
      const remaining = seller.allocatedTotal - seller.consumedCount;
      if (delta > 0 && remaining < delta) {
        throw new HttpsError("failed-precondition", `잔여 티켓이 부족합니다 (잔여 ${remaining}장).`);
      }
      tx.update(sellerRef, { consumedCount: FieldValue.increment(delta) });
      updates.partySize = partySize;
    }

    if (visitDate !== undefined) {
      if (!isValidDateKey(visitDate)) {
        throw new HttpsError("invalid-argument", "방문일 형식이 올바르지 않습니다 (YYYY-MM-DD).");
      }
      updates.visitDate = visitDate;
    }

    tx.update(groupRef, updates);
  });

  return { ok: true };
});

// 그룹 취소 (발급 상태에서만 가능). 배정 잔여를 복구하고 로그를 남깁니다.
const cancelGroup = onCall(async (request) => {
  const { groupId, reason } = request.data || {};
  if (typeof groupId !== "string" || !groupId) {
    throw new HttpsError("invalid-argument", "groupId가 필요합니다.");
  }

  await db.runTransaction(async (tx) => {
    const groupRef = db.collection("ticketGroups").doc(groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 그룹입니다.");
    }
    const group = groupSnap.data();
    requireOwnSellerOrAdmin(request, group.sellerId);

    if (group.status !== "ISSUED") {
      throw new HttpsError(
        "failed-precondition",
        group.status === "CANCELLED" ? "이미 취소된 그룹입니다." : "사용 완료된 그룹은 취소할 수 없습니다."
      );
    }

    const sellerRef = db.collection("sellers").doc(group.sellerId);
    tx.update(sellerRef, {
      consumedCount: FieldValue.increment(-group.partySize),
      cancelledCount: FieldValue.increment(group.partySize),
    });

    tx.update(groupRef, {
      status: "CANCELLED",
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: reason || "",
      updatedAt: FieldValue.serverTimestamp(),
      cancelledBy: request.auth.uid,
    });
    // qrTokens 매핑은 삭제하지 않습니다 — 취소된 QR을 스캔하면
    // "TICKET CANCELLED" 화면이 뜨도록 하기 위함입니다.
  });

  return { ok: true };
});

// QR 재발급: 기존 토큰은 "재발급됨" 상태로 남기고 새 토큰을 발급합니다.
const reissueQr = onCall(async (request) => {
  const { groupId } = request.data || {};
  if (typeof groupId !== "string" || !groupId) {
    throw new HttpsError("invalid-argument", "groupId가 필요합니다.");
  }

  const newToken = await db.runTransaction(async (tx) => {
    const groupRef = db.collection("ticketGroups").doc(groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 그룹입니다.");
    }
    const group = groupSnap.data();
    requireOwnSellerOrAdmin(request, group.sellerId);

    if (group.status !== "ISSUED") {
      throw new HttpsError("failed-precondition", "발급 상태의 그룹만 QR을 재발급할 수 있습니다.");
    }

    const oldTokenRef = db.collection("qrTokens").doc(group.qrToken);
    const newTokenValue = randomToken("WHALE", 10);
    const newTokenRef = db.collection("qrTokens").doc(newTokenValue);

    tx.update(oldTokenRef, { supersededBy: newTokenValue });
    tx.set(newTokenRef, { groupId, supersededBy: null });
    tx.update(groupRef, { qrToken: newTokenValue, updatedAt: FieldValue.serverTimestamp() });

    return newTokenValue;
  });

  return { qrToken: newToken };
});

module.exports = {
  createSeller,
  requestTickets,
  resolvePurchaseRequest,
  allocateTickets,
  createGroup,
  updateGroup,
  cancelGroup,
  reissueQr,
};
