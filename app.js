// استيراد الدوال اللازمة من الـ CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getInstallations, getId } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-installations.js";

// إعدادات Firebase الخاصة بك (استبدل القيم ببيانات مشروعك الحقيقية)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_ID",
  appId: "YOUR_APP_ID"
};

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);
const installations = getInstallations(app);

// دالة جلب الـ FID وعرضه
async function fetchFID() {
    const displayElement = document.getElementById('fid-display');
    try {
        const fid = await getId(installations);
        console.log("Firebase Installation ID:", fid);
        displayElement.innerText = fid;
    } catch (error) {
        console.error("حدث خطأ أثناء جلب الـ FID:", error);
        displayElement.innerText = "فشل استخراج المعرف. تحقق من الإعدادات.";
    }
}

// تشغيل الدالة فور تحميل الصفحة
fetchFID();
