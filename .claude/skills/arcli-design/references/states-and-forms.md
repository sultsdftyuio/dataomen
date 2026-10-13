# States, forms and copy

Distilled from the GOV.UK Design System (`alphagov/govuk-design-system`) and
Primer's UI patterns (`primer/design`). Applies to onboarding, the pilot
application, sign-up/login, settings and every dashboard list.

## Asking questions (onboarding, pilot, sign-up)

- Know why every question is asked; cut any field you can't justify.
- Start with one question per page for multi-step flows; group only related
  questions, under a statement heading.
- The page heading is the question (or the label/legend is the heading), and
  no two pages share a heading.
- Mark optional fields "(optional)"; never use asterisks.
- Labels: sentence case, ≤3 words where possible. Placeholders never replace
  labels.
- Hint text: one short sentence, no links, no full stop. Longer explanations
  go in body text above the field.
- Never ask for the same thing twice; prefill what you already know (e.g. the
  website entered on the landing page).
- Let users say "I'm not sure" when that's a valid answer.
- Primary button says what happens ("Continue", "Submit application"),
  left-aligned at the end of the form, with Cancel to its right.
- Progress indicators only if testing shows they're needed; a simple
  "Step 2 of 4" beats a clickable stepper.
- Always offer a way back that preserves answers; don't break browser Back.
- Avoid range sliders; offer a typed or choice-based alternative.

## Validation and error messages

- Validate on submit, not on blur or while typing (exception: live limits
  like character counts).
- Accept reasonable formats: trim spaces, accept URLs with or without
  `https://` and `www.`, ignore stray punctuation in numbers.
- On error: keep everything the user entered, show an error summary at the top
  linking to fields and move focus to it, show the message by each field, and
  prefix the page title with "Error: ".
- Message = what went wrong + how to fix it, reusing the label's words.
  - Label "Company website" → "Enter your company website, like acme.com"
  - Empty: an instruction ("Enter your work email").
  - Wrong: a description ("Work email must include an @").
- Never: "invalid", "valid", "error occurred", "this field is required",
  "please", "sorry", "oops", "you forgot", error codes, jargon.
- Eligibility or permission problems aren't validation errors; send users to
  a page that explains why and what they can do.

## Saving

- Default to explicit saving. Never mix auto-save and a Save button in one
  form.
- One save button per form; primary if it saves the page, secondary if it
  saves a section.
- Don't disable Save because nothing changed or the form is invalid; let
  submit trigger validation (disabled buttons are unfocusable and low
  contrast). Do disable it while the request is in flight.
- Verbs: Create, Save, Add, Update, Delete — with the object if ambiguous
  ("Delete dataset").
- On failure, keep the data and say what failed.
- Toggles and switches apply immediately; text, selects and radio groups
  wait for Save.

## Empty states

Decide which kind of empty it is:

1. **Never used:** say what this place is for and what it will show, with
   one primary action to start ("Add your first prospect"). Optional
   secondary link to learn more.
2. **Empty for now:** say that it's empty because of the feature's nature
   ("No new signals since yesterday"), not an error.
3. **No results from filters/search:** show what was searched and offer to
   clear filters.
4. **Couldn't load:** a plain summary ("Prospects couldn't be loaded"), what
   to do (retry, check back), no playful art.

## Loading

- Under ~1s: show nothing (a flash of spinner feels slower).
- 1–3s: indeterminate — a skeleton shaped like the real content for regions,
  a spinner inside the button for actions.
- 3–10s: determinate progress if you can estimate it, with a line saying
  what's happening ("Reading acme.com…").
- Over 10s: treat as a background task; let people keep working and notify
  them when it's done (brief generation, crawls).
- Show items as they arrive; load the most important data first.
- Lifecycle: initiated → in progress → success (inline confirmation unless
  navigating) or failure (message + retry).

## Confirmation pages (pilot application, purchase, brief requested)

Include: what happened, a reference if there is one, what happens next and
when, how to get help, and the most likely next links. Make the page safe to
revisit from a bookmark.

## Writing in the interface

- Plain words from the user's world; describe, don't sell.
- Active voice; the action keeps the same name through the flow
  ("Publish" → "Published").
- Errors explain and direct; they don't apologise or blame.
- Read it out loud; if you wouldn't say it, rewrite it.
