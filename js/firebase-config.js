// Firebase 프로젝트 설정
// Firebase 콘솔(https://console.firebase.google.com) > 프로젝트 설정 > 일반 > 내 앱 에서
// 웹 앱을 추가하면 아래와 동일한 형태의 설정 객체를 받을 수 있습니다.
// 아래 값을 발급받은 값으로 반드시 교체하세요.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);

// 로컬 개발 시에는 `firebase emulators:start` 로 띄운 에뮬레이터(.firebaserc의
// demo-whale-shark 프로젝트)에 연결합니다. 실제 배포 도메인에서는 절대 타지 않는
// 분기이므로 운영 환경에는 영향이 없습니다.
export const firebaseConfig = IS_LOCAL
  ? {
      apiKey: "demo-api-key",
      authDomain: "demo-whale-shark.firebaseapp.com",
      projectId: "demo-whale-shark",
    }
  : {
      apiKey: "AIzaSyB5HjvqxyKucPIx2tMQpmlFM0A2h_DtzBk",
      authDomain: "boracaysean-6217a.firebaseapp.com",
      projectId: "boracaysean-6217a",
      storageBucket: "boracaysean-6217a.firebasestorage.app",
      messagingSenderId: "390619286668",
      appId: "1:390619286668:web:5f03efd80dbba93fedbfa9"
    };

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

if (IS_LOCAL) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
