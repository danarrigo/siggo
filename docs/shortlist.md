# Compare and prepare

[← Back to Siggo](../README.md)

## Compare opportunities

Choose **Compare** on two to four directory rows or inside their details, then open the comparison from the selection bar. Selection stays while you search, switch views, or change filters, and is cleared by a reload. It is not saved to your workspace.

The table keeps participation format, location, fees, eligibility, rewards, registration status, and each date type separate. Unknown means unknown, not free or eligible. Date-only values retain their unlisted time/timezone; provider-listed cutoffs are not treated as verified ends. Last-observed times and saved-snapshot notices remain visible. Long rewards can be expanded.

On narrow screens, scroll horizontally; row labels stay pinned. Comparison runs locally on the available listing facts, uses no AI quota, changes no bookmarks, and does not fetch organizer pages. Personal listings and retained saved snapshots can be compared, but a missing legacy bookmark without metadata cannot acquire invented details.

**Ask about this** inside details or a comparison starts a focused [Ask Siggo](assistant.md) chat. Only current, non-ended public catalog listings are eligible for that action. Personal listings, archived records, and saved-only copies are not uploaded to the model.

## Private participation plans

Open a listing and choose **Start tracking** under **Participation plan**. Starting a plan saves the opportunity if necessary. Choose your own progress:

- **Interested:** considering participation.
- **Preparing:** working on the entry.
- **Submitted:** you marked your entry as submitted.

These are personal labels, not publisher facts. Marking Submitted does not submit anything, confirm acceptance or eligibility, close registration, or move the listing to Archive.

Add private tasks, mark them complete, or remove them. Stage changes and added/completed/removed tasks use the normal workspace save flow; an unadded task draft prompts before leaving the detail view. Saved can be filtered by progress without changing discovery membership in All.

Plans follow existing storage modes: browser-local in unconfigured local preview, or authenticated Postgres storage across signed-in devices. They are **never included automatically in AI context**.

### Retention and limits

- Plans remain with archived or source-removed saved listings. Legacy saved IDs without metadata still expose their notes and plans.
- Unsaving keeps private notes and plans. Editing a retained plan does not silently re-save the listing.
- **Remove plan** requires confirmation and leaves the bookmark and note intact.
- Explicitly deleting a personal listing removes its associated note and plan.
- Up to 200 plans, each with 20 tasks of at most 200 characters, subject to the existing 1,000,000-character workspace limit.

The optional `participationPlans` JSONB field defaults to an empty collection for older workspaces. Existing clients only edit explicitly supplied fields, so a legacy content write cannot erase a plan merely by omitting it. Content remains last-write-wins across devices, not a collaborative task editor. No new migration or external service is needed.

## Verification

`tests/unit/participation.test.ts` covers schema bounds, legacy data, retention, and deletion. Server tests cover explicit edits and managed-counter preservation. `tests/e2e/comparison-progress.spec.ts` covers desktop/mobile comparison, targeted chat, task editing, draft protection, Saved filtering, archive behavior, privacy, and accessibility with fictional data and mocked inference.
