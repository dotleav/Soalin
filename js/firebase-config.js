// ── Konfigurasi Firebase untuk Multiplayer ───────────────────────────────
// Isi dengan config dari Firebase Console:
// Project settings → Your apps → Web app → SDK setup and configuration.
// Config web Firebase memang boleh ada di frontend; keamanan diatur lewat
// firebase/database.rules.json dan Anonymous Authentication.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCf7e1vJ7w0_hAkr2x9WXI8Z4FkKNlhE60",
  authDomain: "soalin-multiplayer.firebaseapp.com",
  projectId: "soalin-multiplayer",
  storageBucket: "soalin-multiplayer.firebasestorage.app",
  messagingSenderId: "780278064213",
  appId: "1:780278064213:web:33da29c1f9961335f360dc",
  measurementId: "G-02F45YQ0R6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
