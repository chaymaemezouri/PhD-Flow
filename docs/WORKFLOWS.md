# Workflows

No paper workflow runs in Phase 0. This document records the rules later phases must implement. The server, not the browser, will decide whether a transition is allowed.

## Principles

- A paper does not have to pass through every state.
- Scientific review, presentation, registration, camera-ready files, similarity, and copyright are separate tracks.
- Rejection and withdrawal end the scientific track and must not be overwritten by a later upload.
- A reviewer recommendation is not a decision. A chair or another authorized scientific role records the decision.
- Each transition stores the previous state, the new state, the actor, the time, a reason, and a related document when there is one.
- Invalid transitions fail in the API even if a client sends them.

## Submission

Authors will save a draft, then submit before the conference deadline. Submission freezes the manuscript except through a revision or camera-ready workflow. The public paper id is assigned once and does not change.

## Review

Assignments move through invitation, acceptance or decline, in progress, completed, cancelled, or overdue. Duplicate active assignments for the same reviewer and paper will be rejected. Conflicts of interest block the assignment.

Blind review is a conference setting:

- Single blind: reviewers are hidden from authors.
- Double blind: author identity is hidden from reviewers, including file names, metadata, and notifications.
- Open review: identities are visible according to the conference setting.

## Decision and later tracks

Decisions are accepted, conditionally accepted, revision required, or rejected. Authors are notified when a decision is published, not when a draft is saved.

Camera-ready, similarity, copyright, and registration each have their own statuses. A similarity percentage is a submitted report value, not a plagiarism verdict. A strict threshold below 20 percent treats 20.0 as not satisfied. Payment, when enabled, is verified manually in the first payment release. A conference can turn payments off.

Presentation assessment is separate from acceptance of the paper.
