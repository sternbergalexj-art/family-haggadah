import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, setDoc, getDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDVT8V_K-ugXBOhGgBm6XdScIR_rUrMGlE",
  authDomain: "family-haggadah.firebaseapp.com",
  projectId: "family-haggadah",
  storageBucket: "family-haggadah.firebasestorage.app",
  messagingSenderId: "1022691018606",
  appId: "1:1022691018606:web:eef5ec78d547574128637f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const submissionsRef = collection(db, "submissions");

export function subscribeToSubmissions(callback) {
  const q = query(submissionsRef, orderBy("createdAt", "asc"));
  return onSnapshot(q, (snapshot) => {
    const subs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(subs);
  }, (error) => {
    console.error("Firestore error:", error);
    callback([]);
  });
}

export async function addSubmission(data) {
  return addDoc(submissionsRef, { ...data, createdAt: Date.now() });
}

export async function removeSubmission(id) {
  return deleteDoc(doc(db, "submissions", id));
}

export async function updateSubmission(id, data) {
  return updateDoc(doc(db, "submissions", id), data);
}

export async function updateSubmissionOrder(id, order) {
  return updateDoc(doc(db, "submissions", id), { order });
}

// File upload to Firebase Storage
export async function uploadFile(file, path) {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}

// PDF Settings stored in Firestore
export async function savePdfSettings(settings) {
  return setDoc(doc(db, "settings", "pdf"), settings, { merge: true });
}

export async function loadPdfSettings() {
  const snap = await getDoc(doc(db, "settings", "pdf"));
  return snap.exists() ? snap.data() : null;
}
