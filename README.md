# Mi lesz az ebéd? — Netlify telepítés és heti ritmus

Teljesen statikus üzem + GitHub Actions automata — **Netlify-kredit: gyakorlatilag nulla**
(nincs Function, nincs Blobs; heti egy mini-deploy + statikus sávszél).

- **Olvasók**: a `menuk.json` statikus fájlt kapják — function-hívás nincs.
- **Automata behúzás**: GitHub Actions (a GitHub ingyenes percein): Szalai heti PDF +
  Wolt (Vital, Soup4You) → Gemini → commit → Netlify auto-deploy.
- **Kézi feltöltés**: kép Ctrl+V-vel az appban, bármely napon → Publikálás (GitHub commit).

## Fájlok
- `index.html` — a teljes app
- `menuk.json` — az aktuális menük (a bot és a Publikálás írja; üresen `{}`)
- `.github/workflows/menuk.yml` — az automata (ütemezett + gombbal indítható)
- `scripts/auto_menuk.mjs` — a behúzó szkript (mely éttermek: `AUTO` lista a tetején)
- `netlify.toml`

## Telepítés (egyszer)
1. **GitHub repó**: tedd fel ezt a mappát egy GitHub-repóba (pl. `mi-az-ebed`).
2. **`index.html` → `GH` konstans (a fájl elején)**: írd át `owner`-t a GitHub-felhasználódra
   és `repo`-t a repó nevére. EZ KELL a Publikálás/automata gombhoz.
3. **Netlify**: New site → Import from Git → válaszd ezt a repót.
   Build command: üres. Publish directory: `.`  (a `netlify.toml` már ezt állítja.)
   Fontos: Git-hez kötve legyen (drag&drop deploy NEM jó, mert a Publikálás a GitHubra
   commitol, és csak a Git-kötött site deployol újra).
4. **GitHub token** (github.com → Settings → Developer settings → Fine-grained tokens):
   csak erre az egy repóra, KÉT joggal — *Contents: Read and write* (Publikálás) és
   *Actions: Read and write* (a „⚙️ Automata behúzás" gomb).
5. **Gemini kulcs** (aistudio.google.com → API keys; az új kulcsok „auth" típusúak — jó):
   - a repóba **secretként a botnak**: Settings → Secrets and variables → Actions →
     új secret `GEMINI_API_KEY`,
   - és az appba is, az első belépéskor (lásd lent).

## Belépés (a te gépeden)
- A menük fölött egy diszkrét **„🔒 belépés"** link. Kattints rá.
- **Első alkalommal** töltsd ki mind a négyet: felhasználónév, jelszó, GitHub token,
  Gemini kulcs. A böngésző a jelszavaddal **titkosítva elmenti** a tokent+kulcsot erre a gépre.
- **Ezután** már csak felhasználónév + jelszó kell — az oldja fel a mentett kulcsokat.
- Más gépen egyszer újra meg kell adni a tokent+kulcsot (a titkosított mentés gépenként külön).
- Statikus oldal lévén a jelszó nem szerveres védelem: a valódi kaput a GitHub token adja
  (nála nélkül nincs mentés). A jelszó arra jó, hogy a token ne nyíltan pihenjen a gépeden.

## Heti ritmus
- **Automata (nulla kattintás)**: a bot hétköznap ~10:30-kor (Budapest nyáron; télen ~9:30)
  magától lefut — Szalai (heti PDF), Vital + Soup4You (Wolt, aznapi). Kézzel is indítható
  az appból a **⚙️ Automata behúzás** gombbal.
- **Kézi (kép, bármely napon)**: A Fűszeres, Márka, Faceroom, La Dolce Vita — screenshot →
  Ctrl+V → Feldolgozás → **Publikálás**. A választó feldolgozás után magától a következő
  helyre ugrik. A publikálás összefésül: csak az általad most szerkesztett éttermeket írja
  rá a friss szerver-állapotra (a bot adatait nem bántja, és fordítva).
- **Leo Pizza** fix hely: mindig látszik (Kebabtál 3130 Ft), nem kell vele semmit tenni.
- A publikus kezdőlapon csak azok az éttermek jelennek meg, amelyeknek van erre a hétre
  feltöltött menüjük (belépve te az összeset látod).

## Őszinte megjegyzések
- A Wolt-végpont **nem hivatalos** — ha a Wolt változtat, a `scripts/auto_menuk.mjs`-ben
  kell igazítani (a szkript ilyenkor nem hasal el, csak kihagyja és logolja az adott helyet).
- A Wolt-árak kiszállítási felárasak (~+700 Ft a helyben árhoz képest) — az ár Wolt-ár.
- A Soup4You automatán (Wolt) ÉS kézzel (kedd reggeli FB-kép) is mehet — a később érkező
  írja felül; ha csak kézzel akarod, vedd ki az `AUTO` listából a szkriptben.
- Az időjárás fejléc az Open-Meteo ingyenes API-ból jön; ha valahol tiltott a külső hívás,
  „—" látszik, de a menük attól még működnek.
- GitHub Actions perc: publikus repónál korlátlan ingyen; privátnál havi 2000 perc —
  a napi ~1-2 perces futás bőven belefér.
