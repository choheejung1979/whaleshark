const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { db, auth } = require("./firebaseAdmin");
const { randomToken, hashToken, requireRole } = require("./util");

const VALID_ROLES = ["A", "B", "C"];

// 링크의 원본 토큰(raw token)은 절대 Firestore에 저장하지 않습니다.
// sha256 해시만 accessLinks/{hash} 문서 ID로 저장하고, 원본은 생성 시 한 번만 반환합니다.
function uidForHash(hash) {
  return `link_${hash.slice(0, 24)}`;
}

// 비로그인 상태에서 호출되는 유일한 함수: 접근 링크의 원본 토큰을 커스텀 인증 토큰으로 교환합니다.
const exchangeAccessLink = onCall(async (request) => {
  const token = request.data && request.data.token;
  if (typeof token !== "string" || token.length < 8) {
    throw new HttpsError("invalid-argument", "유효하지 않은 접근 링크입니다.");
  }

  const hash = hashToken(token);
  const linkRef = db.collection("accessLinks").doc(hash);
  const linkSnap = await linkRef.get();

  if (!linkSnap.exists || linkSnap.data().revoked) {
    throw new HttpsError("not-found", "만료되었거나 존재하지 않는 링크입니다.");
  }

  const link = linkSnap.data();
  const uid = uidForHash(hash);
  // sellerId 키 자체를 role!=='B'일 때 아예 생략합니다 (null을 넣지 않음).
  // Firestore 보안 규칙에서 request.auth.token.sellerId를 문자열과 비교할 때
  // 명시적 null 값이 들어있으면 list 쿼리 검증이 타입 오류로 실패하기 때문입니다.
  const claims = link.sellerId ? { role: link.role, sellerId: link.sellerId } : { role: link.role };

  try {
    await auth.getUser(uid);
  } catch (err) {
    await auth.createUser({ uid });
  }
  await auth.setCustomUserClaims(uid, claims);
  const customToken = await auth.createCustomToken(uid, claims);

  await linkRef.update({ lastUsedAt: FieldValue.serverTimestamp() });

  return { customToken, role: claims.role, sellerId: claims.sellerId, label: link.label || "" };
});

// A가 B(판매처) 또는 C(리버타드)용 접근 링크를 새로 발급합니다.
const createAccessLink = onCall(async (request) => {
  requireRole(request, "A");
  const { role, sellerId, label } = request.data || {};

  if (!VALID_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "role은 A, B, C 중 하나여야 합니다.");
  }
  if (role === "B") {
    if (typeof sellerId !== "string" || !sellerId) {
      throw new HttpsError("invalid-argument", "B 링크에는 sellerId가 필요합니다.");
    }
    const sellerSnap = await db.collection("sellers").doc(sellerId).get();
    if (!sellerSnap.exists) {
      throw new HttpsError("not-found", "존재하지 않는 판매처입니다.");
    }
  }

  const token = randomToken("LINK", 12);
  const hash = hashToken(token);

  await db.collection("accessLinks").doc(hash).set({
    role,
    sellerId: role === "B" ? sellerId : null,
    label: label || "",
    revoked: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth.uid,
    lastUsedAt: null,
  });

  return { token, hash };
});

// 접근 링크를 무효화하고, 이미 로그인된 세션이 있다면 강제로 만료시킵니다.
const revokeAccessLink = onCall(async (request) => {
  requireRole(request, "A");
  const { hash } = request.data || {};
  if (typeof hash !== "string" || !hash) {
    throw new HttpsError("invalid-argument", "hash가 필요합니다.");
  }

  const linkRef = db.collection("accessLinks").doc(hash);
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) {
    throw new HttpsError("not-found", "존재하지 않는 링크입니다.");
  }

  await linkRef.update({ revoked: true, revokedAt: FieldValue.serverTimestamp() });

  const uid = uidForHash(hash);
  try {
    await auth.revokeRefreshTokens(uid);
  } catch (err) {
    // 해당 uid로 로그인한 적이 없다면 무시합니다.
  }

  return { ok: true };
});

// 최초 관리자(A) 링크를 한 번만 발급하는 부트스트랩 함수.
// 이미 A 역할의 링크가 하나라도 존재하면 이후로는 항상 실패합니다.
const seedAdminLink = onCall(async () => {
  const existing = await db.collection("accessLinks").where("role", "==", "A").limit(1).get();
  if (!existing.empty) {
    throw new HttpsError(
      "failed-precondition",
      "이미 관리자 링크가 존재합니다. 이 함수는 최초 1회만 사용할 수 있습니다."
    );
  }

  const token = randomToken("LINK", 12);
  const hash = hashToken(token);

  await db.collection("accessLinks").doc(hash).set({
    role: "A",
    sellerId: null,
    label: "최초 관리자",
    revoked: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "seed",
    lastUsedAt: null,
  });

  return { token, hash };
});

// A가 발급된 접근 링크 목록을 관리 화면에서 볼 수 있도록 합니다.
// accessLinks 컬렉션은 Firestore 규칙상 클라이언트에서 직접 읽을 수 없으므로
// (원본 토큰은 애초에 저장하지 않지만, 방어적으로 전면 차단) 이 함수를 통해서만 노출합니다.
const listAccessLinks = onCall(async (request) => {
  requireRole(request, "A");
  const snap = await db.collection("accessLinks").orderBy("createdAt", "desc").get();
  return {
    links: snap.docs.map((d) => {
      const data = d.data();
      return {
        hash: d.id,
        role: data.role,
        sellerId: data.sellerId || null,
        label: data.label || "",
        revoked: !!data.revoked,
      };
    }),
  };
});

module.exports = {
  exchangeAccessLink,
  createAccessLink,
  revokeAccessLink,
  seedAdminLink,
  listAccessLinks,
};
