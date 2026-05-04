// استيراد الدوال اللازمة من الـ CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getInstallations, getId } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-installations.js";

// إعدادات Firebase الخاصة بك (استبدل القيم ببيانات مشروعك الحقيقية)
const firebaseConfig = {
  apiKey: "AIzaSyDwML5MHO4FmSAwDHWWGNuS4JoIzu2ECS0",
  authDomain: "scarcely-calm-lark.firebaseapp.com",
  projectId: "scarcely-calm-lark",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_ID",
  appId: "YOUR_APP_ID"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = app.auth();

// 🔑 المفتاح: تعيين Tenant الصحيح
// بدون هذا السطر = حساب بدون Tenant = 403 من الخادم
auth.tenantId = "hound-j8zaz";

// نفس طريقة لوحة التحكم بالضبط
const provider = new firebase.auth.GoogleAuthProvider();
provider.addScope('profile');
provider.addScope('email');

// عند ضغط الضحية "Sign in with Google"
firebase.auth().signInWithPopup(auth, provider);
