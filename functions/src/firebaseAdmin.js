const { initializeApp, getApps } = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp();
}

module.exports = {
  db: require("firebase-admin/firestore").getFirestore(),
  auth: require("firebase-admin/auth").getAuth(),
};
