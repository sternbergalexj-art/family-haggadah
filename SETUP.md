# Family Haggadah — Setup Guide

Everything below happens **in your browser** — no terminal needed.

---

## Step 1: Create a Firebase Project (5 minutes)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** (or "Add project")
3. Name it something like `family-haggadah` → Continue
4. Disable Google Analytics (not needed) → **Create Project**
5. Once created, click the **web icon** `</>` to add a web app
6. Name it `haggadah` → **Register app**
7. You'll see a `firebaseConfig` object — **copy it**. It looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "family-haggadah-xxxxx.firebaseapp.com",
     projectId: "family-haggadah-xxxxx",
     storageBucket: "family-haggadah-xxxxx.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

### Enable Firestore Database

8. In the Firebase console sidebar, click **"Firestore Database"**
9. Click **"Create database"**
10. Choose **"Start in test mode"** (allows reads/writes for 30 days — you can lock it down later)
11. Pick the closest region → **Enable**

### Paste your config

12. Open the file `src/firebase.js` in this project
13. Replace the placeholder `firebaseConfig` with your actual config from step 7

---

## Step 2: Upload to GitHub (3 minutes)

1. Go to [github.com/new](https://github.com/new)
2. Name the repo `family-haggadah` → **Create repository**
3. On the new repo page, click **"uploading an existing file"**
4. Drag the **contents** of this folder (all files and folders) into the upload area
5. Make sure you see: `package.json`, `vite.config.js`, `index.html`, `src/`, `vercel.json`, etc.
6. Click **"Commit changes"**

---

## Step 3: Deploy on Vercel (2 minutes)

1. Go to [vercel.com](https://vercel.com) and sign up with your **GitHub account**
2. Click **"Add New → Project"**
3. Find and select your `family-haggadah` repo
4. Vercel auto-detects Vite — just click **"Deploy"**
5. Wait ~60 seconds → you get a live URL like `https://family-haggadah.vercel.app`

**That's it!** Share the URL with your family.

---

## Customization

### Change the family name & year
Edit `src/App.jsx` — find these lines near the top of the `App` component:
```js
const [familyName] = useState("Our Family");
const [year] = useState("5786");
```
Change them to your family name and the current Hebrew year.

### Change the admin password
In `src/App.jsx`, find:
```js
const ADMIN_PASSWORD = "seder";
```
Change `"seder"` to whatever you'd like.

### After making changes
Just commit the changes on GitHub — Vercel auto-redeploys in ~30 seconds.

---

## Security Note

The Firebase "test mode" rules expire after 30 days. Before they expire, go to
**Firestore → Rules** and set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /submissions/{doc} {
      allow read: if true;
      allow create: if true;
      allow delete: if request.auth != null;
    }
  }
}
```

This allows anyone to read/submit but only authenticated users to delete.
For a simple family project, test mode is perfectly fine for Passover.

---

## How It Works

- **Family members** visit your Vercel URL → click "Add Dvar Torah" → pick a section → type or upload → submit
- **You (admin)** click "Admin" → enter password → see all submissions, delete if needed, preview the formatted Haggadah
- **Submissions sync in real-time** via Firebase — everyone sees updates instantly

חג פסח שמח! 🍷
