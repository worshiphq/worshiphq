# WorshipHQ on Google Cloud Run (the backup host)

Goal: a second, free place the site can run, so that if Vercel pauses the site you only change DNS to bring it back.
The database stays at Supabase, so no data moves. Vercel keeps working exactly as it does today.

Region used below: europe-west4 (Netherlands). It supports custom domains on Cloud Run and is close to the database in Frankfurt.

## Part 1 - Google Cloud (about 20 minutes)

1. Go to https://console.cloud.google.com and sign in with a Google account.
2. Create a project: top bar, project picker, New project. Name it `worshiphq`. Note the Project ID (for example `worshiphq-123456`).
3. Link billing (a card is required even for the free tier): menu, Billing, link a billing account to the project.
4. Set a budget alert so you hear about any spend: Billing, Budgets and alerts, Create budget. Amount 1 dollar. Alerts at 50%, 90% and 100%, to your email.
   (A budget only warns, it does not stop spending. The deploy below also limits the site to 2 instances, which caps the cost.)
5. Turn on the services: menu, APIs and services, Library. Enable: Cloud Run Admin API, Artifact Registry API.
6. Create the place images are stored: menu, Artifact Registry, Create repository. Name `worshiphq`, format Docker, region `europe-west4`.
7. Create the robot account GitHub will use: menu, IAM and admin, Service accounts, Create. Name `github-deployer`.
   Give it these roles: Cloud Run Admin, Artifact Registry Writer, Service Account User.
8. Open that account, Keys, Add key, Create new key, JSON. A file downloads. Keep it private: it is a password.

## Part 2 - GitHub (about 10 minutes)

Repository settings, Secrets and variables, Actions.

Variables (not secret):
- `GCP_PROJECT` = your Project ID
- `GCP_REGION` = `europe-west4`

Secrets:
- `GCP_SA_KEY` = the whole contents of the JSON file from step 8
- `APP_ENV` = every production setting, one `NAME=value` per line (copy them from Vercel: Project, Settings, Environment Variables)
- `CRON_SECRET` = the same value as the CRON_SECRET setting

## Part 3 - First deploy to the temporary web address

1. GitHub, Actions tab, "Deploy to Cloud Run", Run workflow. The first build takes about 10 minutes.
2. When it finishes, Google Cloud, Cloud Run, `worshiphq`. The page shows a web address ending in `.run.app`.
3. Open it. Check the sign-in page, then sign in to a real church and look around.
   Careful: this copy uses the REAL database. Only look, do not create or delete anything, and do not make a real payment on the temporary address
   (payments return to worshiphq.app).

## Part 4 - Daily job

Vercel runs the once-a-day job (billing, backups, trial notices). On Cloud Run this is done by `.github/workflows/daily-cron.yml`.
It is OFF until you set the repository variable `CRON_VIA_GITHUB` to `true`. Turn it on only when the site is really running from Cloud Run,
and turn it off again when you go back to Vercel, or the daily job runs twice.
The 30-minute checks are made by Supabase calling your domain, so they follow the domain automatically.

## Part 5 - Pointing the domain (only when Parts 1 to 4 work)

The domain is registered at Namecheap. Cloud Run domain mapping: Cloud Run, Manage custom domains, Add mapping, then add the DNS records Google shows
at Namecheap (Advanced DNS). Keep the email records (MX, SPF, DKIM) untouched.
To go back to Vercel, put the Vercel records back at Namecheap. Lower the TTL to 5 minutes the day before so the switch is quick.
