# Deployment Guide

## GitHub Pages

This repository is configured for GitHub Pages deployment through GitHub Actions.

The workflow file is:

- `.github/workflows/deploy.yml`

## What the workflow does

On push to `main` or manual workflow dispatch, GitHub Actions will:

1. check out the repository
2. assemble a deployment artifact from the committed static files
3. include `database/*.json` in that artifact
4. publish the artifact to GitHub Pages

The workflow does not rebuild JSON from Excel.

## Files included in the deployed site

The deployed artifact contains:

- `index.html`
- `app.js`
- `styles.css`
- `.nojekyll`
- `database/*.json`

The local `source/` directory and build-only reference files are not deployed to GitHub Pages.

## GitHub setup steps

1. Push this repository to GitHub.
2. Open the repository settings.
3. Go to `Pages`.
4. Set the Pages source to `GitHub Actions`.
5. Push to `main` or run the workflow manually.

## Local build before deployment

If your data has changed, rebuild locally first:

```bash
python -m pip install -r requirements.txt
python build_search_database.py
```

Then commit the updated JSON files and push them.

## Local preview before deployment

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Troubleshooting

### Site loads but searches fail

Open browser developer tools and confirm that:

- `database/alias_lookup.json` loads successfully
- `database/search_index.json` loads successfully

### Data changes are not visible after deployment

Confirm that the push to `main` included the regenerated JSON files in `database/`.

### GitHub Pages workflow fails

Check the Actions tab and inspect the failed job step. Because the workflow only packages committed files, most failures here are repository configuration issues rather than Python build issues.
