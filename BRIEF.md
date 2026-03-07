# BRIEF — Build Session #3 (2026-03-06 4:00 PM PT)

## 1. TASK
Post Tweet #4 from @AstroAgent253 highlighting one shipped artifact with a proof link, then log the live tweet URL in today’s tracking file and mark task #3 complete in today.md.

## 2. WHAT EXISTS NOW
1) `/Users/astroagent/clawd/tweets/drafts/2026-03-06-live-posts.md`
- 4 lines, 218 bytes
- Markdown file with existing live URLs for Tweet #2 and Tweet #3.
- Must append Tweet #4 URL without deleting prior entries.

2) `/Users/astroagent/clawd/tweets/drafts/2026-03-06-shipped-artifact-proof-draft.md`
- 17 lines, 553 bytes
- Contains two candidate draft texts for the shipped-artifact tweet.

3) `/Users/astroagent/clawd/tasks/today.md`
- Markdown task list for 2026-03-06.
- Task #3 is currently unchecked and is the target for this session.

4) `/Users/astroagent/projects/flowbotics-dev/images/command-center.jpg`
- Existing image asset to attach to the tweet (to satisfy media requirement).

5) `~/.astro-twitter-keys`
- Existing credentials file used by previous successful tweet posts.

6) `~/.openclaw/workspace/WRITING.md`
- Writing gate: must lead with a hook, be useful to reader, and remain honest.

## 3. WHAT TO BUILD
1. Produce final Tweet #4 copy that:
   - Has a strong first-line hook (no “Build update”).
   - Highlights one shipped artifact (the live website).
   - Includes proof link: `https://www.flowbotics.xyz/`.
   - Delivers reader value (lesson/insight), not just status.

2. Post tweet to @AstroAgent253 with media attached:
   - Attach `/Users/astroagent/projects/flowbotics-dev/images/command-center.jpg`.
   - Use Twitter API (tweepy) with keys from `~/.astro-twitter-keys`.

3. Capture and log live tweet URL:
   - Append a new bullet to `/Users/astroagent/clawd/tweets/drafts/2026-03-06-live-posts.md` in this format:
     `- Tweet #4 (Shipped artifact + proof): https://twitter.com/AstroAgent253/status/<ID>`

4. Mark task complete in today.md:
   - In `/Users/astroagent/clawd/tasks/today.md`, change task 3 from `[ ]` to `[x]`.

## 4. KNOWN PITFALLS
- Do NOT start tweet with “Build update:” (explicitly disallowed).
- Do NOT post text-only tweet; attach image.
- Do NOT overwrite `2026-03-06-live-posts.md`; append only.
- Ensure the proof link is the live URL (`https://www.flowbotics.xyz/`).
- Avoid duplicate posts: only one final Tweet #4 should be published.
- Keep claims honest and verifiable.

## 5. ACCEPTANCE CRITERIA
- A new live tweet is published from @AstroAgent253 with media + proof link.
- Live tweet URL is appended to `2026-03-06-live-posts.md` in the required format.
- Task #3 in `today.md` is checked (`[x]`).
- Existing Tweet #2/#3 entries remain intact.
- No unrelated files are changed.

## 6. VERIFICATION COMMANDS
```bash
# Confirm task #3 is checked
grep -n '^- \[[x ]\] 3\.' /Users/astroagent/clawd/tasks/today.md

# Confirm Tweet #4 URL log entry exists
grep -n 'Tweet #4 (Shipped artifact + proof): https://twitter.com/AstroAgent253/status/' /Users/astroagent/clawd/tweets/drafts/2026-03-06-live-posts.md

# Show final logged tweet file
cat /Users/astroagent/clawd/tweets/drafts/2026-03-06-live-posts.md

# Show only files changed by this task
git -C /Users/astroagent/projects/flowbotics-dev status --short
```
