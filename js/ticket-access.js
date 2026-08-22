// A/B/C 티켓 시스템 공용 접근 헬퍼.
// URL의 ?t=<token> 을 Cloud Function(exchangeAccessLink)으로 교환해 로그인하고,
// 이후에는 Firebase Auth 세션이 브라우저에 유지되므로 매번 링크를 열 필요가 없습니다.
import { auth, functions } from "./firebase-config.js";
import {
  signInWithCustomToken,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const exchangeAccessLinkFn = httpsCallable(functions, "exchangeAccessLink");

async function consumeUrlToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");
  if (!token) return;

  const { data } = await exchangeAccessLinkFn({ token });
  await signInWithCustomToken(auth, data.customToken);

  // 평문 토큰이 브라우저 히스토리/북마크에 남지 않도록 URL에서 제거합니다.
  params.delete("t");
  const query = params.toString();
  const cleanUrl = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
  window.history.replaceState({}, document.title, cleanUrl);
}

/**
 * 접근 링크(또는 기존 세션)를 확인하고 role/sellerId를 반환합니다.
 * expectedRoles와 실제 role이 다르면 WRONG_ROLE 에러로 reject됩니다.
 * expectedRoles를 여러 개(배열 또는 여러 인자)로 넘기면 그중 하나만 맞아도 통과합니다.
 * 유효한 링크도 세션도 없으면 NO_SESSION 에러로 reject됩니다.
 */
export function requireAccess(...expectedRoles) {
  const allowedRoles = expectedRoles.flat().filter(Boolean);
  return new Promise((resolve, reject) => {
    consumeUrlToken()
      .catch((err) => {
        // 토큰 교환 실패(만료/무효 링크)는 아래 onAuthStateChanged(user=null)로 이어집니다.
        console.error("접근 링크 교환 실패:", err);
      })
      .finally(() => {
        const unsubscribe = onAuthStateChanged(
          auth,
          async (user) => {
            unsubscribe();
            if (!user) {
              reject(new Error("NO_SESSION"));
              return;
            }
            try {
              const idTokenResult = await user.getIdTokenResult(true);
              const { role, sellerId } = idTokenResult.claims;
              if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
                reject(new Error("WRONG_ROLE"));
                return;
              }
              resolve({ role, sellerId: sellerId || null, uid: user.uid });
            } catch (err) {
              reject(err);
            }
          },
          reject
        );
      });
  });
}

export function signOutAccess() {
  return signOut(auth);
}
