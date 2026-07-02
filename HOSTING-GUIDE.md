# 🚀 Put RITA on the Internet — Super Simple Guide

This guide gets your RITA app **live on the internet for free**, with a real login,
real tickets, and the RITA helper bot — all working. No experience needed.

You'll do 3 things:

1. **Part A – The brain (database):** make a free Supabase account and paste in one file.
2. **Part B – The website:** turn the app into a folder and drop it on a free host.
3. **Part C – Make yourself the boss (admin).**

Total time: about 30–40 minutes. Take it slow, do the steps in order. ☕

> 💡 There is **no AI key and no monthly bill** — everything here uses free plans.

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

# PART B — The website 🌐

Now we turn the app into a website and put it online.

### B1. Put your keys into the app
1. Open this file with **Notepad**:
   `C:\Users\Hemant Prabhu\Desktop\rita-app\.env`
   *(If it's not there, right-click in the folder → New → Text Document, name it exactly `.env`, and remove the “.txt”.)*
2. Make it look **exactly** like this, using YOUR values from step A5:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://abcd1234xyz.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-long-anon-key-here
   ```
3. Save and close (Ctrl+S).

### B2. Open a terminal in the app folder
1. Open the folder `C:\Users\Hemant Prabhu\Desktop\rita-app` in File Explorer.
2. Click the address bar at the top, type **`powershell`**, and press Enter.
   A blue/black window opens — that's the terminal. It's already in the right folder. 👍

### B3. Build the website (one command)
1. In that terminal, type this and press Enter:
   ```
   npx expo export -p web
   ```
2. Wait 1–2 minutes. When it finishes you'll see a list of pages and the word **“Exported: dist”**.
3. 🟡 **If instead you see a red error mentioning `global.css`**, don't worry — just press the **Up arrow** and **Enter** to run the same command again. It works on the second try.

This created a new folder called **`dist`** inside your app folder. That folder *is* your website.

### B4. Put it online (drag & drop — no account needed to try)
1. Go to **https://app.netlify.com/drop** in your browser.
2. Open File Explorer to `C:\Users\Hemant Prabhu\Desktop\rita-app`.
3. **Drag the `dist` folder** onto the Netlify page where it says “Drag and drop your site folder here.”
4. Wait a few seconds. Netlify gives you a live link like
   `https://random-name-123.netlify.app` — **that's your app on the internet!** 🎉
5. (It'll ask you to make a free account to keep the site — do that so the link stays alive.)

> 📝 Copy that live link — you need it for the next step.

### B5. Tell Supabase your website is allowed
1. Back in Supabase → **Authentication** → **URL Configuration**.
2. In **Site URL** (and **Redirect URLs**), paste your Netlify link (e.g. `https://random-name-123.netlify.app`).
3. Save.

✅ **Part B done!** Open your Netlify link — you should see the **RITA login screen**. 🎊

---

# PART C — Become the admin 👑

Right now anyone who signs up is a normal store user. Let's make YOU the admin so you can see all the dashboards.

### C1. Create your account in the app
1. Open your Netlify link.
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

2. **Publish the new version:**
   - Run `npx expo export -p web` again (rebuilds the `dist` folder).
   - Go to your site on Netlify → **Deploys** tab → drag the new `dist` folder in again. Done.

For a more detailed developer workflow (testing on an Android phone, building the real iPhone/Android apps for the app stores, automatic publishing from GitHub), see **RUNNING.md** in the app folder.

---

# 😅 If something goes wrong

- **Login says something failed:** double-check the two keys in `.env` are exactly right (no extra spaces), then rebuild (B3) and re-drag (B4).
- **“Can't sign up” / spins forever:** make sure you turned **Confirm email OFF** (step A4).
- **Ticket won't submit:** make sure your Store ID matches a store that exists (demo ones are `ST-5501`, `ST-5502`, `ST-5601`).
- **The build error about `global.css`:** just run the build command again (it's a one-time hiccup).

You've got this. 💪
