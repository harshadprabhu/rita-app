# 🚀 Put RITA on the Internet — Super Simple Guide

This guide gets your RITA app **live on the internet for free**, with a real login,
real tickets, and the RITA helper bot — all working. No experience needed.

You'll do 3 things:

1. **Part A – The brain (database):** make a free Supabase account and paste in one file.
2. **Part B – The website:** push your code to GitHub, and GitHub automatically builds and publishes it — every time you make a change and push, the live site updates itself.
3. **Part C – Make yourself the boss (admin).**

Total time: about 30–40 minutes. Take it slow, do the steps in order. ☕

> 💡 There is **no AI key and no monthly bill** — everything here uses free plans (GitHub + Supabase free tiers).

---

## 🧰 Before you start

You need:

- A computer with internet (you're on it 🙂).
- An email address.
- The RITA project folder on your computer:
  `C:\Users\Hemant Prabhu\Desktop\rita-app`

That's it. Let's go.

---

# PART A — The brain (Supabase database) 🧠

This is where all your users, tickets, and messages get stored.

### A1. Make a Supabase account
1. Go to **https://supabase.com**
2. Click **Start your project** → sign up (Google or email is fine).

### A2. Make a new project
1. Click **New project**.
2. **Name:** `rita`
3. **Database Password:** click **Generate a password**, then **copy it and paste it somewhere safe** (Notes/Notepad). You may need it later.
4. **Region:** pick the one closest to you (e.g. *Mumbai* / *Singapore*).
5. Click **Create new project**. Wait ~2 minutes while it builds. ⏳

### A3. Build all the tables (the magic paste)
1. On the left sidebar, click **SQL Editor**.
2. Click **New query**.
3. Open this file on your computer with Notepad:
   `C:\Users\Hemant Prabhu\Desktop\rita-app\supabase\full-setup.sql`
4. Select **all** of it (Ctrl+A), copy (Ctrl+C).
5. Paste it into the big empty box in Supabase (Ctrl+V).
6. Click the green **Run** button (bottom right).
7. You should see **“Success. No rows returned.”** 🎉

That one paste created every table, all the security rules, the photo storage, and 3 demo stores.

### A4. Turn on Email login
1. Left sidebar → **Authentication** → **Sign In / Providers** (or **Providers**).
2. Find **Email** and make sure it's **enabled** (toggle green).
3. **Important:** find the setting **“Confirm email”** and turn it **OFF**.
   (This lets people log in right after signing up — no email-clicking needed. You can turn it back on later.)
4. Click **Save** if there's a save button.

### A5. Grab your 2 secret keys 🔑
1. Left sidebar → **Project Settings** (gear icon) → **API**.
2. You'll see two things — copy each into your safe notes:
   - **Project URL** → looks like `https://abcd1234xyz.supabase.co`
   - **anon public** key → a long string of letters/numbers.

Keep these two handy — you'll paste them in Part B.

### A6. (Optional) Turn on photo attachments
Only if you want people to attach photos to tickets. The app works fine without it.
1. SQL Editor → **New query**.
2. Paste the file `supabase\storage-setup.sql` (same way as A3) and click **Run**.
3. If it turns red with a “must be owner” message, skip it — just follow the short
   UI steps written at the top of that file instead. Everything else still works.

✅ **Part A done!** Your app's brain is alive.

---

# PART B — The website, hosted on GitHub 🌐

We'll push your code to GitHub. From then on, **every time you push a change,
GitHub automatically builds the app and publishes it** — no manual building,
no dragging folders, ever again.

Your site will live at:
**`https://YOUR-GITHUB-USERNAME.github.io/rita-app/`**

### B1. Create the GitHub repository
1. Go to **https://github.com/new**
2. Repository name: exactly **`rita-app`** (must match — it's part of your website's link)
3. Choose Public or Private — either works with GitHub Pages.
4. **Don't** tick "Add a README".
5. Click **Create repository**. Leave this tab open.

### B2. Open a terminal in the app folder
1. Open the folder `C:\Users\Hemant Prabhu\Desktop\rita-app` in File Explorer.
2. Click the address bar at the top, type **`powershell`**, and press Enter.
   A blue/black window opens — that's the terminal. It's already in the right folder. 👍

### B3. Push your code
Type these one at a time (replace `YOUR-GITHUB-USERNAME` with your real username):
```
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/rita-app.git
git branch -M main
git push -u origin main
```
A browser window may pop up asking you to log into GitHub — sign in there and it continues automatically.

### B4. Give GitHub your 2 secret keys
The website needs your Supabase keys from step A5, but we **never put them in a
file that gets uploaded** — instead we store them safely inside GitHub itself:

1. On your repo's GitHub page, click **Settings** (top tab).
2. Left sidebar → **Secrets and variables** → **Actions**.
3. Click **New repository secret** and add this one:
   - Name: `EXPO_PUBLIC_SUPABASE_URL`
   - Value: your Project URL from step A5
   - Click **Add secret**
4. Click **New repository secret** again and add:
   - Name: `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Value: your anon public key from step A5
   - Click **Add secret**

### B5. Turn on GitHub Pages
1. Still in **Settings** → left sidebar → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
   (Don't pick "Deploy from a branch" — we want Actions.)

### B6. Watch it build
1. Click the **Actions** tab (top of the repo page).
2. You'll see a run called "Deploy web app to GitHub Pages" — click it and watch it go
   (it takes 2–4 minutes: installs, builds, publishes).
3. When it turns green ✅, go back to **Settings → Pages** — you'll see your live
   link at the top: `https://YOUR-GITHUB-USERNAME.github.io/rita-app/`

> 📝 Copy that live link — you need it for the next step.

### B7. Tell Supabase your website is allowed
1. Back in Supabase → **Authentication** → **URL Configuration**.
2. In **Site URL** (and **Redirect URLs**), paste your GitHub Pages link.
3. Save.

✅ **Part B done!** Open your GitHub Pages link — you should see the **RITA login screen**. 🎊

---

# PART C — Become the admin 👑

Right now anyone who signs up is a normal store user. Let's make YOU the admin so you can see all the dashboards.

### C1. Create your account in the app
1. Open your GitHub Pages link.
2. Click **Create an account**.
3. Fill it in. For **Store ID**, type one of the demo stores: **`ST-5501`**.
4. Submit. You're now logged in as a normal user.

### C2. Promote yourself to admin
1. Back in Supabase → **SQL Editor** → **New query**.
2. Paste this and click **Run**:
   ```sql
   update profiles
   set role = 'admin', approval_status = 'approved', is_active = true
   where id = (select id from auth.users order by created_at desc limit 1);
   ```
   *(This promotes the most recently created user — that's you.)*
3. In your app, **log out and log back in.** You'll now land on the **Admin** home. 👑

✅ **Everything works now:** login, reporting tickets, the RITA bot logging tickets from chat, technicians claiming tickets, and the admin dashboards.

---

# 🎛️ Everyday things you'll want to do

**Add real stores** (instead of the demo ones):
Supabase → **Table Editor** → `stores` → **Insert row**. Use an ID like `ST-1234` (capital letters). People sign up with that Store ID.

**Make someone a technician / manager:**
Supabase → **Table Editor** → `profiles` → find the person → change their `role` to `technician`, `manager`, or `admin`, and set `approval_status` to `approved`.

---

# 🛠️ Changing the app later (then re-publishing)

The app lives in `C:\Users\Hemant Prabhu\Desktop\rita-app`. When you want to change something:

1. **See changes instantly while you work** (no publishing needed):
   In the terminal (from B2), run:
   ```
   npx expo start
   ```
   then press **`w`** to open it in your browser. Edit a file, save, and it updates live. Press **Ctrl+C** to stop.

   *(Common thing to edit: the RITA bot's keywords live in
   `lib\utils\categoryClassifier.ts` — add words to the lists to change how it
   sorts tickets. No AI, just word matching.)*

2. **Publish the new version — just push:**
   ```
   git add -A
   git commit -m "describe what you changed"
   git push
   ```
   That's it. GitHub automatically rebuilds and republishes the site (watch it
   happen in the **Actions** tab) — usually live again in 2–4 minutes.

For a more detailed developer workflow (testing on an Android phone, building the real iPhone/Android apps for the app stores), see **RUNNING.md** in the app folder.

---

# 🔒 A rule to always follow

**Never save passwords, keys, or secrets in any file inside this project folder**
(not even a `.txt` "notes" file) — anything in this folder can accidentally get
pushed to GitHub for the world to see. Keep secrets in your password manager, or
in GitHub's own **Settings → Secrets** (step B4) — never in a plain file here.

---

# 😅 If something goes wrong

- **Login says something failed:** double-check your 2 secrets in **Settings → Secrets and variables → Actions** (step B4) are exactly right, then re-run the build: **Actions** tab → click the latest run → **Re-run all jobs**.
- **“Can't sign up” / spins forever:** make sure you turned **Confirm email OFF** (step A4).
- **Ticket won't submit:** make sure your Store ID matches a store that exists (demo ones are `ST-5501`, `ST-5502`, `ST-5601`).
- **Actions tab shows a red ❌:** click into the failed run to read the error — usually a typo in one of the two secret names/values.
- **Page shows GitHub's 404 instead of the app:** double-check **Settings → Pages → Source** is set to **GitHub Actions** (step B5), not "Deploy from a branch".

You've got this. 💪
