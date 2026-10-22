# Medora – publisering i App Store

Alt som trengs for å få Medora ut, i rekkefølge. Kryss av underveis.

## 1. Før du betaler noe
- [ ] Supabase: slå av «Confirm email» (Authentication → Sign In / Providers → Email).
- [ ] Supabase: legg `{{ .Token }}` inn i e-postmalen «Reset Password» (Authentication → Emails).
- [ ] Supabase: gratisprosjekter settes på pause etter 7 dager uten bruk. Sjekk at prosjektet er aktivt, og trykk «Restore» hvis det står «Paused».
- [ ] Server: `cd ~/Desktop/MedExam/server && npm audit fix && railway up`
- [ ] OpenAI: sett et månedstak under Settings → Limits.
- [ ] Test appen en uke i Expo Go.

## 2. Nettsidene (gratis, GitHub Pages)
Mappen `docs/` inneholder support-, personvern- og vilkårssidene.
1. Gjør repoet offentlig, eller behold det privat og bruk GitHub Pro (Pages krever offentlig repo på gratiskonto).
   Alternativ: lag et eget lite offentlig repo `medora-site` og kopier bare `docs/`-mappen dit.
2. Repo → Settings → Pages → Source: «Deploy from a branch» → Branch `main`, mappe `/docs` → Save.
3. Etter et minutt ligger sidene på:
   - Support: `https://nimamalekiiii.github.io/<repo>/`
   - Personvern: `https://nimamalekiiii.github.io/<repo>/privacy.html`
   - Vilkår: `https://nimamalekiiii.github.io/<repo>/terms.html`

## 3. Apple Developer-konto
1. Meld deg inn på developer.apple.com/programs (krever Apple-ID med totrinnsbekreftelse).
2. Velg «Individual». Navnet ditt vises da som utvikler i App Store.

## 4. Bygge appen (EAS)
App-ID-en er satt til `no.medora.app` i `app.json`. Den kan ikke endres etter publisering.

```
npm install -g eas-cli
cd ~/Desktop/MedExam
eas login
eas init
```

Nøklene i `.env.local` blir ikke med i builden, fordi filen ikke lastes opp. Legg dem inn i EAS én gang:

```
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "<fra .env.local>" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "<fra .env.local>" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_MEDEXAM_API_URL --value "<fra .env.local>" --visibility plaintext
```

Bygg og send til TestFlight:

```
eas build --platform ios --profile production
eas submit --platform ios --latest
```

EAS lager sertifikater og app-oppføring i App Store Connect for deg når du logger inn med Apple-ID.

## 5. TestFlight
App Store Connect → Medora → TestFlight → legg til kona di som intern tester. Hun får appen via TestFlight-appen.

## 6. App Store-oppføringen
Tekstene står under. I App Store Connect trengs også:
- [ ] Skjermbilder fra en 6,9" iPhone (f.eks. iPhone 16 Pro Max-simulator eller egen telefon): Hjem, Emner, Quiz, Flashcards, Fremgang.
- [ ] Personvern-URL og support-URL fra steg 2.
- [ ] Aldersgrense: svar ærlig på Apples spørreskjema. Medisinsk informasjon i læringsøyemed gir vanligvis 12+. Vilkårene sier at appen er for studenter fra 16 år.
- [ ] Kategori: Utdanning (sekundær: Medisin).
- [ ] Testkonto til Apple under «App Review Information»: lag en egen konto i appen (f.eks. `medora.review@gmail.com`) med et par emner og temaer, og oppgi e-post og passord der.
- [ ] Merknad til Apple: «Medora er et studieverktøy for medisinstudenter. AI brukes til å lage studiespørsmål fra brukerens eget pensum. Appen gir ikke medisinsk rådgivning, se helseforbeholdet under Innstillinger → Om Medora.»

### Navn
Medora: Studier for medisin

### Undertittel (maks 30 tegn)
Quiz, flashcards og AI-hjelp

### Promotekst (maks 170 tegn)
Les smartere til eksamen. Medora lager quiz, flashcards og Active Recall fra ditt eget pensum, og viser hva du bør lese i dag.

### Beskrivelse
Medora er studieappen for medisinstudenter som vil ha kontroll på pensum fram mot eksamen.

Legg inn emnene og temaene dine, last opp forelesningsnotater eller PDF-er, og la AI lage studiemateriell som følger ditt eget pensum.

STUDER SMARTERE
• Quiz med forklaringer, tidsbegrenset eksamensmodus og adaptiv vanskelighetsgrad
• Flashcards med spredt repetisjon, så kortene kommer tilbake når du er i ferd med å glemme dem
• Active Recall: åpne spørsmål du svarer på fra hukommelsen
• Fokustimer med pauser

AI SOM KJENNER PENSUMET DITT
• Pensum lagres per tema og brukes til alt AI lager i det temaet
• Forslag til temaer for et emne, eller fra dine egne notater
• Daglig anbefaling om hva du bør lese, basert på svake temaer og eksamensdatoer

OVERSIKT OG FREMGANG
• Fremgang per tema som bygges opp over tid og falmer hvis du ikke repeterer
• Nedtelling og klarhet før hver eksamen
• Studieplan som følger fremgangen din
• Studierekke, dagsmål og daglig motivasjon

PERSONVERN
Dataene dine selges aldri, og appen har ingen reklame eller sporing.

Medora er et læringsverktøy og gir ikke medisinsk rådgivning.

### Nøkkelord (maks 100 tegn, komma uten mellomrom)
medisin,eksamen,flashcards,quiz,studie,anatomi,farmakologi,repetisjon,student,pensum,AI

### Apples personvernspørsmål («App Privacy»)
Svar «Yes, we collect data». Ingen data brukes til sporing. Kryss av for:
| Datatype | Formål | Knyttet til brukeren |
|---|---|---|
| Contact Info → Email Address | App Functionality | Ja |
| Contact Info → Name | App Functionality | Ja |
| User Content → Photos | App Functionality (profilbilde) | Ja |
| User Content → Other User Content (notater, studiedata) | App Functionality | Ja |
| Identifiers → User ID | App Functionality | Ja |

Ikke kryss av for Usage Data, Diagnostics, Location eller Health & Fitness.
