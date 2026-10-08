# MedExam AI server

The app uses this server for AI study suggestions, quizzes, flashcards, Active Recall, and progress analysis. Keep the OpenAI key here; never put it in an `EXPO_PUBLIC_*` variable. Every AI request requires a valid Supabase user session. The server verifies the access token with Supabase Auth and applies per-user request limits.

## Run locally

1. Copy `server/.env.example` to `server/.env` and set the OpenAI key, Supabase project URL, and Supabase publishable key. Do not use a Supabase secret or `service_role` key.
2. Run `npm install` once inside `server/`.
3. Start the backend with `npm run dev:server` from the project root.
4. In another terminal, start the Expo app from the project root with `npm start`.

In Expo development, the app uses the same host address as Metro and port `3000` for the AI server. A physical phone and the computer running the server need to be on a network that can reach one another. For a deployed server, host this directory with Node.js 22.13 or later using `npm start` (or build `server/Dockerfile`), then set `EXPO_PUBLIC_MEDEXAM_API_URL` in the app's `.env.local` to the HTTPS base URL provided by the host. Rebuild the app after changing that URL. Store builds intentionally do not fall back to localhost.

### Production environment

Configure these server variables in the hosting provider's secret/environment settings:

- `OPENAI_API_KEY`: private OpenAI API key.
- `OPENAI_MODEL`: model available to your OpenAI project.
- `SUPABASE_URL`: MedExam's Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: the project's publishable key. Never use `service_role` or a secret key.
- `AI_MAX_REQUESTS_PER_DAY`: optional per-user daily cap; defaults to 30.

The `/health` endpoint reports `configured: true` only when all required server values are present. Use HTTPS for the public endpoint and set that exact base URL in the app's `.env.local`. The request counter is held in process memory, so use a single server instance unless you replace it with shared rate-limit storage.

AI requests are made only after choosing **Generate with AI** on a topic. Requests can incur OpenAI API charges. Quiz and flashcard notes are sent to OpenAI to create study material; the server requests that responses are not stored.
