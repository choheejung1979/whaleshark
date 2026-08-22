const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");

function randomToken(prefix, bytes = 8) {
  const raw = crypto.randomBytes(bytes).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${prefix}-${raw}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  return request.auth;
}

function requireRole(request, ...roles) {
  const auth = requireAuth(request);
  const role = auth.token.role;
  if (!roles.includes(role)) {
    throw new HttpsError("permission-denied", "이 작업을 수행할 권한이 없습니다.");
  }
  return auth.token;
}

// B가 자기 판매처가 아닌 sellerId로 조작을 시도하지 못하도록 강제합니다.
function requireOwnSellerOrAdmin(request, sellerId) {
  const token = requireRole(request, "A", "B");
  if (token.role === "B" && token.sellerId !== sellerId) {
    throw new HttpsError("permission-denied", "다른 판매처의 데이터는 수정할 수 없습니다.");
  }
  return token;
}

// Firestore Timestamp는 onCall 응답의 JSON 직렬화 형태가 모호하므로,
// 클라이언트로 보내기 전에 항상 ISO 문자열로 명시적으로 변환합니다.
function toIso(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === "function") return timestamp.toDate().toISOString();
  return null;
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isValidDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

module.exports = {
  randomToken,
  hashToken,
  requireAuth,
  requireRole,
  requireOwnSellerOrAdmin,
  toIso,
  todayKey,
  isValidDateKey,
};
