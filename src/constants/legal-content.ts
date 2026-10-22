import type { StudyIconName } from '@/components/study-icon';

/**
 * The privacy pages, the health disclaimer and the terms of use, in English
 * and Norwegian. Everything here describes what the app really does: if the
 * app starts collecting something new, this file has to change with it.
 */

/** Who is responsible for the app. Fill these in before publishing to the App Store. */
export const LEGAL = {
  /** The person or company that publishes Medora. */
  publisher: 'Nima Maleki',
  /** Where users can reach you about privacy and their data. */
  contactEmail: 'nima.maleki200214@gmail.com',
  lastUpdated: '2026-10-22',
} as const;

export type LegalPageId = 'privacy' | 'collection' | 'use' | 'storage' | 'rights' | 'third-parties' | 'health' | 'terms' | 'licenses';

type Text = { en: string; no: string };
export type LegalItem = { icon: StudyIconName; title: Text; detail: Text; link?: LegalPageId };
export type LegalPage = {
  icon: StudyIconName;
  title: Text;
  subtitle: Text;
  /** A short lead paragraph shown in its own card. */
  intro?: Text;
  listTitle?: Text;
  items: LegalItem[];
  /** A closing note shown with an info icon. */
  note?: Text;
};

export const LEGAL_PAGES: Record<LegalPageId, LegalPage> = {
  privacy: {
    icon: 'shieldLock',
    title: { en: 'Privacy', no: 'Personvern' },
    subtitle: { en: 'We take your privacy seriously.', no: 'Vi tar personvernet ditt på alvor.' },
    items: [
      { icon: 'database', link: 'collection', title: { en: 'Data collection', no: 'Datainnsamling' }, detail: { en: 'What data we collect', no: 'Hvilke data vi samler inn' } },
      { icon: 'settings', link: 'use', title: { en: 'How we use data', no: 'Hvordan vi bruker data' }, detail: { en: 'To make the app work for you', no: 'For at appen skal virke for deg' } },
      { icon: 'lock', link: 'storage', title: { en: 'Storage and security', no: 'Lagring og sikkerhet' }, detail: { en: 'How we protect your data', no: 'Hvordan vi beskytter dataene dine' } },
      { icon: 'person', link: 'rights', title: { en: 'Your rights', no: 'Dine rettigheter' }, detail: { en: 'Access, changes and deletion', no: 'Tilgang, endring og sletting' } },
      { icon: 'layers', link: 'third-parties', title: { en: 'Third-party services', no: 'Tredjepartstjenester' }, detail: { en: 'The outside services we use', no: 'Eksterne tjenester vi bruker' } },
    ],
    note: {
      en: 'We never sell your data, and Medora has no ads and no tracking.',
      no: 'Vi selger aldri dataene dine, og Medora har ingen reklame og ingen sporing.',
    },
  },

  collection: {
    icon: 'database',
    title: { en: 'Data collection', no: 'Datainnsamling' },
    subtitle: { en: 'What Medora stores about you.', no: 'Hva Medora lagrer om deg.' },
    intro: {
      en: 'Medora only collects what is needed for you to sign in, keep your study material and get help from AI.',
      no: 'Medora samler bare inn det som trengs for at du skal kunne logge inn, ta vare på studiematerialet ditt og få hjelp av AI.',
    },
    listTitle: { en: 'What we store:', no: 'Dette lagrer vi:' },
    items: [
      { icon: 'person', title: { en: 'Account information', no: 'Kontoinformasjon' }, detail: { en: 'Your email address and your password. The password is stored encrypted and we cannot read it.', no: 'E-postadressen din og passordet ditt. Passordet lagres kryptert, og vi kan ikke lese det.' } },
      { icon: 'graduation', title: { en: 'Profile', no: 'Profil' }, detail: { en: 'Name and, if you choose to add them, date of birth, education, university, study year, location, a short bio and a profile picture.', no: 'Navn og, hvis du velger å legge det inn, fødselsdato, utdanning, universitet, studieår, sted, en kort beskrivelse og profilbilde.' } },
      { icon: 'book', title: { en: 'Study data', no: 'Studiedata' }, detail: { en: 'Subjects, topics, exam dates, study plans, flashcards, questions, quiz results and your study history.', no: 'Emner, temaer, eksamensdatoer, studieplaner, flashcards, spørsmål, quizresultater og studiehistorikken din.' } },
      { icon: 'note', title: { en: 'Course material', no: 'Pensum' }, detail: { en: 'Notes you paste in and notes made from PDFs you import. The PDF file itself is not kept.', no: 'Notater du limer inn og notater laget fra PDF-er du importerer. Selve PDF-filen blir ikke lagret.' } },
      { icon: 'sliders', title: { en: 'Settings', no: 'Innstillinger' }, detail: { en: 'Language, appearance, study preferences and reminder times.', no: 'Språk, utseende, studiepreferanser og tidspunkt for påminnelser.' } },
    ],
    note: {
      en: 'Medora does not collect usage statistics, device information, location or crash reports, and it has no advertising identifiers.',
      no: 'Medora samler ikke inn bruksstatistikk, enhetsinformasjon, posisjon eller feilrapporter, og bruker ingen reklame-ID-er.',
    },
  },

  use: {
    icon: 'settings',
    title: { en: 'How we use data', no: 'Hvordan vi bruker data' },
    subtitle: { en: 'Only to make the app work for you.', no: 'Bare for at appen skal virke for deg.' },
    items: [
      { icon: 'key', title: { en: 'Signing in', no: 'Innlogging' }, detail: { en: 'Your email and password identify your account and keep it yours.', no: 'E-post og passord identifiserer kontoen din og sørger for at den er din.' } },
      { icon: 'cloud', title: { en: 'Backup and sync', no: 'Sikkerhetskopi og synk' }, detail: { en: 'Your study data is saved to your account so it is not lost if you change or lose your phone.', no: 'Studiedataene lagres på kontoen din, slik at de ikke går tapt om du bytter eller mister telefonen.' } },
      { icon: 'chart', title: { en: 'Progress and plan', no: 'Fremgang og plan' }, detail: { en: 'Your results are used on your phone to calculate progress, what is due and what to study next.', no: 'Resultatene dine brukes på telefonen til å regne ut fremgang, hva som har forfalt og hva du bør lese nå.' } },
      { icon: 'sparkles', title: { en: 'AI help', no: 'AI-hjelp' }, detail: { en: 'When you ask AI for questions, flashcards, topics or a review, the subject, topic, your course material and summaries of your results are sent to the AI. Your name and email are not sent.', no: 'Når du ber AI om spørsmål, flashcards, temaer eller en vurdering, sendes emne, tema, pensumet ditt og sammendrag av resultatene dine til AI-en. Navn og e-post sendes ikke.' } },
      { icon: 'bell', title: { en: 'Reminders', no: 'Påminnelser' }, detail: { en: 'Reminders are scheduled on your own phone. Nothing about them is sent to us.', no: 'Påminnelser settes opp på din egen telefon. Ingenting om dem sendes til oss.' } },
    ],
    note: {
      en: 'We do not use your data for advertising, profiling or training our own AI models.',
      no: 'Vi bruker ikke dataene dine til reklame, profilering eller til å trene egne AI-modeller.',
    },
  },

  storage: {
    icon: 'lock',
    title: { en: 'Storage and security', no: 'Lagring og sikkerhet' },
    subtitle: { en: 'Where your data is and how it is protected.', no: 'Hvor dataene dine ligger og hvordan de beskyttes.' },
    items: [
      { icon: 'phone', title: { en: 'On your phone', no: 'På telefonen din' }, detail: { en: 'Your study data is stored in the app on your phone. Your sign-in is kept in the phone\'s secure keychain.', no: 'Studiedataene lagres i appen på telefonen din. Innloggingen ligger i telefonens sikre nøkkelring.' } },
      { icon: 'cloud', title: { en: 'In your account', no: 'På kontoen din' }, detail: { en: 'A copy is stored in a database where each user can only read and change their own data. Profile pictures are stored privately.', no: 'En kopi lagres i en database der hver bruker bare kan lese og endre sine egne data. Profilbilder lagres privat.' } },
      { icon: 'shield', title: { en: 'In transit', no: 'Underveis' }, detail: { en: 'Everything sent between the app, your account and the AI goes over an encrypted connection.', no: 'Alt som sendes mellom appen, kontoen din og AI-en går over kryptert forbindelse.' } },
      { icon: 'person', title: { en: 'Shared phones', no: 'Delte telefoner' }, detail: { en: 'If someone else signs in on the same phone, your data is put away and they see only their own.', no: 'Hvis noen andre logger inn på samme telefon, legges dataene dine til side, og de ser bare sine egne.' } },
      { icon: 'clock', title: { en: 'How long', no: 'Hvor lenge' }, detail: { en: 'We keep your data until you delete it or delete your account.', no: 'Vi beholder dataene dine til du sletter dem eller sletter kontoen din.' } },
    ],
  },

  rights: {
    icon: 'person',
    title: { en: 'Your rights', no: 'Dine rettigheter' },
    subtitle: { en: 'You decide over your own data.', no: 'Du bestemmer over dine egne data.' },
    items: [
      { icon: 'download', title: { en: 'See and export', no: 'Se og eksportere' }, detail: { en: 'You can export all your study data as a file under Settings, Data, sync and security.', no: 'Du kan eksportere alle studiedataene dine som en fil under Innstillinger, Data, synk og sikkerhet.' } },
      { icon: 'pencil', title: { en: 'Change', no: 'Endre' }, detail: { en: 'You can change your profile, your email and all your study content in the app at any time.', no: 'Du kan når som helst endre profilen, e-posten og alt studieinnholdet ditt i appen.' } },
      { icon: 'trash', title: { en: 'Delete', no: 'Slette' }, detail: { en: 'Under Settings, Privacy and data, you can delete your study data or your whole account. Deleting the account removes it from your phone and from the cloud.', no: 'Under Innstillinger, Personvern og data kan du slette studiedataene eller hele kontoen. Sletter du kontoen, fjernes den både fra telefonen og fra skyen.' } },
      { icon: 'help', title: { en: 'Ask or complain', no: 'Spørre eller klage' }, detail: { en: 'You can contact us about your data at any time. If you live in Norway, you can also complain to the Norwegian Data Protection Authority (Datatilsynet).', no: 'Du kan når som helst kontakte oss om dataene dine. Bor du i Norge, kan du også klage til Datatilsynet.' } },
    ],
  },

  'third-parties': {
    icon: 'layers',
    title: { en: 'Third-party services', no: 'Tredjepartstjenester' },
    subtitle: { en: 'The outside services Medora depends on.', no: 'De eksterne tjenestene Medora er avhengig av.' },
    items: [
      { icon: 'cloud', title: { en: 'Supabase', no: 'Supabase' }, detail: { en: 'Handles sign-in and stores your account, your study data and your profile picture.', no: 'Håndterer innlogging og lagrer kontoen, studiedataene og profilbildet ditt.' } },
      { icon: 'sparkles', title: { en: 'OpenAI', no: 'OpenAI' }, detail: { en: 'Creates the AI content. It receives the subject, topic, course material, imported PDFs and result summaries that you ask AI to work with. We ask OpenAI not to store these requests. OpenAI may still keep them for a limited time to prevent abuse, under its own terms.', no: 'Lager AI-innholdet. Den mottar emne, tema, pensum, importerte PDF-er og resultatsammendrag som du ber AI jobbe med. Vi ber OpenAI om ikke å lagre forespørslene. OpenAI kan likevel beholde dem en begrenset tid for å hindre misbruk, etter sine egne vilkår.' } },
      { icon: 'settings', title: { en: 'Railway', no: 'Railway' }, detail: { en: 'Runs the Medora server that checks you are signed in and passes your AI requests on. The server does not save your content.', no: 'Kjører Medora-serveren som sjekker at du er logget inn og sender AI-forespørslene dine videre. Serveren lagrer ikke innholdet ditt.' } },
      { icon: 'phone', title: { en: 'Apple', no: 'Apple' }, detail: { en: 'Delivers the app and shows reminders on your phone.', no: 'Leverer appen og viser påminnelser på telefonen din.' } },
    ],
    note: {
      en: 'These services may process data outside Norway and the EEA.',
      no: 'Disse tjenestene kan behandle data utenfor Norge og EØS.',
    },
  },

  health: {
    icon: 'heartPulse',
    title: { en: 'Health disclaimer', no: 'Helseforbehold' },
    subtitle: { en: 'Medora is a learning tool for medical students and other health personnel in training.', no: 'Medora er et læringsverktøy for medisinstudenter og annet helsepersonell under utdanning.' },
    items: [
      { icon: 'graduation', title: { en: 'Not medical advice', no: 'Ikke medisinsk rådgivning' }, detail: { en: 'The content in the app is for education and is not meant to replace professional medical advice.', no: 'Innholdet i appen er for utdanningsformål og er ikke ment å erstatte profesjonell medisinsk rådgivning.' } },
      { icon: 'note', title: { en: 'No diagnosis or treatment', no: 'Ingen diagnostikk eller behandling' }, detail: { en: 'The app does not give medical diagnoses, treatment recommendations or clinical decisions. Never use it to treat yourself or a patient.', no: 'Appen gir ikke medisinske diagnoser, behandlingsanbefalinger eller kliniske beslutninger. Bruk den aldri til å behandle deg selv eller en pasient.' } },
      { icon: 'sparkles', title: { en: 'AI can be wrong', no: 'AI kan ta feil' }, detail: { en: 'Questions, answers, flashcards and explanations are written by AI and can contain errors or be out of date.', no: 'Spørsmål, svar, flashcards og forklaringer er skrevet av AI og kan inneholde feil eller være utdaterte.' } },
      { icon: 'warning', title: { en: 'Check reliable sources', no: 'Sjekk med pålitelige kilder' }, detail: { en: 'Always use current textbooks, guidelines and the instructions from your own school.', no: 'Bruk alltid oppdatert faglitteratur, retningslinjer og veiledere fra din utdanningsinstitusjon.' } },
      { icon: 'checkShield', title: { en: 'Your own responsibility', no: 'Eget ansvar' }, detail: { en: 'You are responsible for how you use the information from the app. Medora does not promise any exam result.', no: 'Du er selv ansvarlig for hvordan du bruker informasjonen fra appen. Medora lover ikke noe eksamensresultat.' } },
    ],
    note: {
      en: 'In an emergency, call your local emergency number. In Norway that is 113.',
      no: 'Ved akutt sykdom, ring nødnummeret der du er. I Norge er det 113.',
    },
  },

  terms: {
    icon: 'note',
    title: { en: 'Terms of use', no: 'Vilkår for bruk' },
    subtitle: { en: 'What applies when you use Medora.', no: 'Dette gjelder når du bruker Medora.' },
    items: [
      { icon: 'graduation', title: { en: 'A study tool', no: 'Et studieverktøy' }, detail: { en: 'Medora helps you organise and practise your studies. It is not medical advice, see the health disclaimer.', no: 'Medora hjelper deg å organisere og øve på studiene. Det er ikke medisinsk rådgivning, se helseforbeholdet.' }, link: 'health' },
      { icon: 'person', title: { en: 'Your account', no: 'Kontoen din' }, detail: { en: 'You are responsible for keeping your password to yourself and for what happens in your account. Medora is meant for students aged 16 and over.', no: 'Du har ansvar for å holde passordet ditt for deg selv og for det som skjer på kontoen din. Medora er ment for studenter fra 16 år.' } },
      { icon: 'note', title: { en: 'Your content', no: 'Innholdet ditt' }, detail: { en: 'The notes and PDFs you add stay yours. Only add material you have the right to use, such as your own notes and course material you have access to.', no: 'Notater og PDF-er du legger inn, er fortsatt dine. Legg bare inn materiale du har rett til å bruke, som egne notater og pensum du har tilgang til.' } },
      { icon: 'sparkles', title: { en: 'AI content', no: 'AI-innhold' }, detail: { en: 'AI content is created automatically and can be wrong. There is a daily limit on AI requests so the service stays available.', no: 'AI-innhold lages automatisk og kan være feil. Det er en daglig grense for AI-forespørsler, slik at tjenesten holder seg tilgjengelig.' } },
      { icon: 'warning', title: { en: 'No guarantee', no: 'Ingen garanti' }, detail: { en: 'The app is provided as it is. We work to keep it running and your data safe, but cannot promise that it is free of errors or always available. Export a backup of anything you cannot afford to lose.', no: 'Appen leveres som den er. Vi jobber for at den skal virke og at dataene dine er trygge, men kan ikke love at den er feilfri eller alltid tilgjengelig. Eksporter en sikkerhetskopi av det du ikke har råd til å miste.' } },
      { icon: 'trash', title: { en: 'Ending', no: 'Avslutte' }, detail: { en: 'You can stop using Medora and delete your account at any time in the app.', no: 'Du kan når som helst slutte å bruke Medora og slette kontoen din i appen.' } },
      { icon: 'pencil', title: { en: 'Changes', no: 'Endringer' }, detail: { en: 'When these terms or the privacy pages change, the date at the bottom of the page is updated.', no: 'Når disse vilkårene eller personvernsidene endres, oppdateres datoen nederst på siden.' } },
    ],
  },

  licenses: {
    icon: 'checkShield',
    title: { en: 'Licence information', no: 'Lisensinformasjon' },
    subtitle: { en: 'Open-source software Medora is built with.', no: 'Åpen kildekode Medora er bygget med.' },
    intro: {
      en: 'Medora is built with open-source software. We are grateful to the people who make it. Each project is used under its own licence.',
      no: 'Medora er bygget med åpen kildekode. Vi er takknemlige overfor dem som lager den. Hvert prosjekt brukes under sin egen lisens.',
    },
    items: [
      { icon: 'layers', title: { en: 'React and React Native', no: 'React og React Native' }, detail: { en: 'MIT licence. Meta Platforms, Inc. and contributors.', no: 'MIT-lisens. Meta Platforms, Inc. og bidragsytere.' } },
      { icon: 'layers', title: { en: 'Expo and Expo Router', no: 'Expo og Expo Router' }, detail: { en: 'MIT licence. 650 Industries, Inc. and contributors.', no: 'MIT-lisens. 650 Industries, Inc. og bidragsytere.' } },
      { icon: 'layers', title: { en: 'Supabase JavaScript client', no: 'Supabase JavaScript-klient' }, detail: { en: 'MIT licence. Supabase and contributors.', no: 'MIT-lisens. Supabase og bidragsytere.' } },
      { icon: 'layers', title: { en: 'React Native Reanimated and SVG', no: 'React Native Reanimated og SVG' }, detail: { en: 'MIT licence. Software Mansion and contributors.', no: 'MIT-lisens. Software Mansion og bidragsytere.' } },
      { icon: 'layers', title: { en: 'Express and the OpenAI library', no: 'Express og OpenAI-biblioteket' }, detail: { en: 'Used on the Medora server. MIT and Apache 2.0 licences.', no: 'Brukes på Medora-serveren. MIT- og Apache 2.0-lisens.' } },
    ],
  },
};
