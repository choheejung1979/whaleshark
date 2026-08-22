const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db } = require("./firebaseAdmin");
const { requireRole } = require("./util");

// B 대시보드 첫 로딩용 요약 스냅샷 (실시간 갱신은 클라이언트에서 Firestore
// onSnapshot으로 처리하며, 이 함수는 상태별 합계처럼 매번 다시 세기 번거로운
// 값을 한 번에 계산해서 돌려줍니다).
const getSellerDashboardData = onCall(async (request) => {
  const token = requireRole(request, "B");
  const sellerId = token.sellerId;

  const [sellerSnap, groupsSnap] = await Promise.all([
    db.collection("sellers").doc(sellerId).get(),
    db.collection("ticketGroups").where("sellerId", "==", sellerId).get(),
  ]);

  if (!sellerSnap.exists) {
    throw new HttpsError("not-found", "판매처 정보를 찾을 수 없습니다.");
  }

  const summary = { ISSUED: 0, USED: 0, CANCELLED: 0 };
  groupsSnap.forEach((doc) => {
    const status = doc.data().status;
    if (summary[status] !== undefined) summary[status] += 1;
  });

  const seller = sellerSnap.data();
  return {
    seller: { id: sellerId, ...seller, remaining: seller.allocatedTotal - seller.consumedCount },
    groupCounts: summary,
  };
});

// A 대시보드 첫 로딩용 요약 스냅샷 (판매처별/전체 배정·사용·취소 합계 +
// 대기 중인 구매 요청). 실시간 값은 클라이언트가 sellers 컬렉션을
// onSnapshot으로 직접 구독합니다.
const getAdminOverview = onCall(async (request) => {
  requireRole(request, "A");

  const [sellersSnap, pendingSnap] = await Promise.all([
    db.collection("sellers").get(),
    db.collection("purchaseRequests").where("status", "==", "pending").get(),
  ]);

  const sellers = [];
  const totals = { allocatedTotal: 0, consumedCount: 0, usedCount: 0, cancelledCount: 0 };
  sellersSnap.forEach((doc) => {
    const data = doc.data();
    sellers.push({ id: doc.id, ...data, remaining: data.allocatedTotal - data.consumedCount });
    totals.allocatedTotal += data.allocatedTotal || 0;
    totals.consumedCount += data.consumedCount || 0;
    totals.usedCount += data.usedCount || 0;
    totals.cancelledCount += data.cancelledCount || 0;
  });

  const pendingPurchaseRequests = pendingSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return { sellers, totals, pendingPurchaseRequests };
});

module.exports = {
  getSellerDashboardData,
  getAdminOverview,
};
