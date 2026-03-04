# Template: Language Tutor (SRS + lessons)

## UX: Create an agent

Do not start from a blank canvas:

1. Template gallery → select “Language Tutor (SRS + lessons)”
2. Wizard fills canonical state:
   - native language, target language
   - level (or “Assess me”)
   - goal (Speaking/Exam/Business/Travel)
   - daily time budget
   - style (strict/concise/etc.)
   - topics include/exclude
3. Schedule (daily trigger), optional notifications
4. Memory transparency: show “what will be stored” (canonical fields)
5. Model preset (Balanced/Cheap/Best) + advanced mapping
6. Optional custom instructions (short)

## Skeleton workflow (stable)

- Trigger (daily/manual)
- LoadProfileState
- SelectNextActivity (policy enum + confidence; low confidence => default)
- RunActivity (subflow):
  - `SRS_REVIEW | NEW_LESSON | CONVERSATION | TEST | REVIEW_MISTAKES`
- Evaluate (rubric + short test)
- MemoryWrite (propose patch)
- ValidateAndCommit
- (Optional) Notify
