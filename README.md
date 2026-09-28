# Team Trivia

A live team trivia game built for phones and a host screen. Each team joins through a QR code. The host writes questions, opens and closes each one, reveals answers, and can correct any team's points.

## Game format

- **Round one and round two:** Add up to six questions per round. With six questions, teams can wager 1–6, using each number only once in that round. The available wagers reset for round two. Correct answers earn the wager; incorrect answers earn zero.
- **Halftime:** One ordering question with eight items. Each item in the right position earns one point.
- **Final:** Teams lock in a wager up to their current score before the question appears. A correct answer adds the wager; a wrong answer subtracts it.
- **Tiebreaker:** An optional closest-number question. It sorts teams tied on points by their distance from the answer after the reveal.
- **Scoring:** Written answers matching the expected answer (ignoring case and extra spaces) earn the wager automatically. The host may correct misspellings or award partial credit, up to the team's wager for that question. Separate bonus points can be added for any team.

The host can write single choice, select-all, ordering, and written questions in the main rounds, and give each question an optional category. Team answers and scores are saved in Supabase. The game title can be edited in the lobby.

## Updating an existing trivia project

Run `supabase/add-question-categories.sql` and `supabase/add-bonus-points.sql` in the existing Supabase project's SQL Editor before deploying the updated code. The statements preserve existing games, teams, and questions. They can safely be run again if needed.

## Set up a separate database

1. Create a **new Supabase project** for trivia. This keeps it separate from Dollfolio.
2. Open its SQL Editor. Copy and run the complete contents of `supabase/schema.sql` once.
3. In the Supabase project settings, copy the project URL and a **secret API key**. Keep the secret on the server; never put it in client code, a public repository, or a `NEXT_PUBLIC_` variable.

## Deploy with Vercel

1. Put this folder in its own GitHub repository. Do not include `node_modules`, `.next`, or `.env.local`.
2. In Vercel, create a new project from that repository. The framework is Next.js and the root directory is the repository root.
3. Add these environment variables in the Vercel project settings:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | The URL of the new trivia Supabase project |
   | `SUPABASE_SECRET_KEY` | Its server-side secret API key |

4. Deploy. Use the resulting `vercel.app` address, or connect a custom domain in Vercel.
5. Create a game, add questions, and test with a second phone before the party. Keep the host screen or its saved browser profile to yourself; the QR code contains only the team join link.

For local development, copy `.env.example` to `.env.local`, fill in the values, then run `npm install` and `npm run dev`. The schema must already exist in the new Supabase project.

## Notes

- The host link is stored in that browser's local storage. Use the same browser to return to your game. Team phones also remember their team.
- The host sees question prompts and submitted answers. Team phones show answer fields and choices without displaying the question prompt; read or display each question separately. The host may correct scores before or after revealing the answer.
- A game's question lineup can be changed until the first question opens. Decide the number of questions in each round before starting, because that number sets its wager range.
- If you do not need a tiebreaker, leave it unopened after the final.
