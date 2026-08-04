# Branch update — v8.3.0

Apply this package to the existing `feature/read-anything-import-system` branch.

```bash
git checkout feature/read-anything-import-system
git pull origin feature/read-anything-import-system
# Copy the package contents into the repository root.
git add .
git commit -m "Add imported-text formatting and reading levels"
git push
```

On Render, deploy the latest commit for `mark-set-go-cloud-test`. No new environment variable is required when `OPENAI_API_KEY` is already configured.

## Test

1. Capture or import a short article.
2. Open **Format** beside the reader title.
3. Switch between **Original wording** and **Clean layout**.
4. Select High school, Grade 8, Grade 6, Grade 4, or College and click **Apply level**.
5. Confirm the original remains available.
6. Confirm normal reader modes still behave as before.

The protected reader files are unchanged. Book Pages was not modified.
