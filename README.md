# Café T's Place — Biljartreserveringen

Reserveringssysteem voor de twee biljarttafels (**Wit** en **Zwart**). Gebouwd met
Next.js + Supabase, bedoeld om gratis of zeer goedkoop te draaien op Vercel.

## Wat je nodig hebt

- Een gratis [GitHub](https://github.com) account
- Een gratis [Supabase](https://supabase.com) account
- Een gratis [Vercel](https://vercel.com) account
- Optioneel: een eigen domeinnaam (bv. via [combell.com](https://www.combell.com) of
  [namecheap.com](https://www.namecheap.com))
- [Node.js](https://nodejs.org) (versie 18 of hoger) als je het lokaal wil testen

## Stap 1 — Supabase-project aanmaken (de database)

1. Ga naar [supabase.com](https://supabase.com) → **New project**.
2. Kies een naam (bv. `tsplace-reserveringen`) en een wachtwoord voor de database
   (bewaar dit ergens veilig).
3. Wacht tot het project klaar is (duurt 1–2 minuten).
4. Ga naar **SQL Editor** → **New query**.
5. Plak de volledige inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik
   **Run**. Dit maakt de `reservations`-tabel aan met de juiste regels.
6. Ga naar **Database** → **Replication**, en zet de toggle naast de tabel
   `reservations` **aan**. Dit zorgt ervoor dat alle geopende schermen live
   bijwerken zodra iemand boekt of annuleert.
7. Ga naar **Settings** → **API**. Je hebt twee waarden nodig:
   - **Project URL**
   - **anon public** key

## Stap 2 — Project op je computer klaarzetten

```bash
# in de projectmap
cp .env.local.example .env.local
```

Open `.env.local` en vul de twee waarden van Supabase in:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Test lokaal (optioneel maar aan te raden):

```bash
npm install
npm run dev
```

Open `http://localhost:3000` — als de tafels en uren verschijnen, werkt de
koppeling met Supabase.

## Stap 3 — Naar GitHub pushen

```bash
git init
git add .
git commit -m "Eerste versie biljartreserveringen"
```

Maak een nieuwe, lege repository aan op GitHub, en volg de instructies die
GitHub toont om je lokale project ernaartoe te pushen (iets als):

```bash
git remote add origin https://github.com/JOUW-GEBRUIKERSNAAM/tsplace-reserveringen.git
git branch -M main
git push -u origin main
```

## Stap 4 — Deployen op Vercel

1. Ga naar [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. Kies je GitHub-repository.
3. Bij **Environment Variables**, voeg dezelfde twee waarden toe als in je
   `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Klik **Deploy**. Na ongeveer een minuut krijg je een live link zoals
   `https://tsplace-reserveringen.vercel.app`.

## Stap 5 — Eigen domeinnaam koppelen (optioneel)

1. Koop een domeinnaam (bv. `tsplace-biljart.be`).
2. In Vercel: ga naar je project → **Settings** → **Domains** → voeg je
   domein toe.
3. Vercel toont welke DNS-records je moet instellen bij je
   domeinregistrar. Voeg die toe — na enige tijd (soms tot enkele uren) is
   je eigen domein actief.

## Kosten (samengevat)

- Supabase: gratis tier, ruim voldoende voor dit gebruik
- Vercel: gratis tier, ruim voldoende voor dit gebruik
- Domeinnaam: ca. €8–15/jaar, enige echte vaste kost

## Wijzigingen doorvoeren nadat het live staat

Dit is geen Claude-artifact meer eenmaal live — het is een gewoon
GitHub-project. Wijzigingen verlopen zo:

1. **Codewijzigingen** (bv. andere openingsuren, teksten, kleuren):
   - Vraag de aanpassing aan Claude (hier in de chat, of via **Claude Code**
     als je rechtstreeks in de projectmap op je computer wil werken zonder
     kopiëren/plakken).
   - Test lokaal met `npm run dev` indien gewenst.
   - Commit en push naar GitHub:
     ```bash
     git add .
     git commit -m "Omschrijving van de wijziging"
     git push
     ```
   - Vercel detecteert de push automatisch en deployt de nieuwe versie
     (meestal binnen 1 minuut, te volgen op vercel.com).

2. **Databasewijzigingen** (bv. een derde tafel toevoegen, een kolom
   aanpassen):
   - Gebeuren **niet automatisch** mee met een Vercel-deploy.
   - Voer het bijhorende SQL-script apart uit via **SQL Editor** in je
     Supabase-project.

3. **Omgevingsvariabelen** (bv. als je ooit van Supabase-project wisselt):
   - Aanpassen bij Vercel → **Settings** → **Environment Variables**, en
     opnieuw deployen (**Deployments** → **Redeploy**).

## Bekende beperking

Er is geen echt inlogsysteem. Iedereen met de link kan reserveren en
annuleren; de app houdt via een lokaal opgeslagen "toestel-ID" bij welke
reservering van jou is, maar dit is geen beveiliging — een technisch
onderlegde bezoeker zou dit kunnen omzeilen. Voor een café-tool is dit
doorgaans aanvaardbaar; laat het weten als je hier ooit echte
gebruikersaccounts voor wil.
