# Gene Fusion Knowledgebase

Static single-page search interface for curated gene fusion data.

The deployed site is fully static. GitHub Pages serves the committed frontend files and committed JSON indexes stored in `database/`.

## Overview

This repository has two roles:

1. host the static frontend for interactive search
2. store the local build script that converts curated Excel workbooks into browser-ready JSON

The frontend uses a single search input with automatic type inference:

- known gene symbols and aliases are treated as gene queries
- diagnosis labels are treated as diagnosis queries
- values that look like fusions are treated as fusion queries

Search runs entirely in the browser after the JSON files are loaded.

## Search Behaviors

### Gene search

Returns:

- canonical gene name
- normalization note when an alias or historical symbol was entered
- related diagnoses
- fusion partner genes
- known aliases recorded for that canonical symbol

Examples:

- `MKL2` normalizes to `MRTFB`
- `HMGIC` normalizes to `HMGA2`
- `C11orf95` normalizes to `ZFTA`

### Diagnosis search

Returns:

- related genes
- highlighted main fusion genes when the same gene recurs across at least two fusion pairs
- related fusions

### Fusion search

Returns:

- normalized fusion label
- related diagnoses
- observed fusion labels stored in the data

Fusion queries are direction-insensitive for lookup. For example, `LPP::HMGA2` and `HMGA2::LPP` resolve to the same fusion record.

Fusion normalization also handles common separator variants before lookup:

- `gene1:gene2`
- `gene1-gene2`
- `gene1--gene2`

These are normalized to `gene1::gene2` for display and search.

### Autocomplete

- Autocomplete always suggests genes, aliases, and diagnoses while typing.
- Fusion suggestions appear after `::` is present.
- Direct substring matches are prioritized (including long multi-word diagnoses).
- If no exact match is found, the interface shows `No exact match found` and a `Did you mean` section.

## Repository Layout

```text
.
├── .github/workflows/deploy.yml
├── .nojekyll
├── app.js
├── build_search_database.py
├── database/
│   ├── alias_lookup.json
│   ├── diagnosis_to_gene_fusion_mapping.json
│   ├── gene_to_diagnosis_mapping.json
│   ├── gene_to_gene_fusion_mapping.json
│   ├── hgnc_complete_set.txt
│   └── search_index.json
├── docs/
│   ├── DEPLOYMENT.md
│   └── USAGE.md
├── index.html
├── requirements.txt
├── source/               # local-only input workbooks, ignored by git
└── styles.css
```

## Data Flow

### Local source inputs

For local data refresh, `build_search_database.py` reads these Excel workbooks from `source/`:

- `Diagnosis_to_gene_fusion_mapping.xlsx`
- `Gene_to_diagnosis_mapping.xlsx`
- `Gene_to_gene_fusion_mapping.xlsx`

The `source/` directory is ignored by git in this repository. It is treated as local build input, not as deployed web content.

### Reference table

The build step also reads:

- `database/hgnc_complete_set.txt`

This HGNC table is used to map historical symbols and aliases to canonical gene names.

### Generated JSON outputs

Running `build_search_database.py` writes:

- `database/alias_lookup.json`
- `database/search_index.json`
- `database/diagnosis_to_gene_fusion_mapping.json`
- `database/gene_to_diagnosis_mapping.json`
- `database/gene_to_gene_fusion_mapping.json`

The frontend only consumes the generated JSON files.

## Local Development

### Requirements

- Python 3.10 or newer
- `openpyxl`

Install the dependency:

```bash
python -m pip install -r requirements.txt
```

### Rebuild the search database locally

Place the three Excel files in `source/`, then run:

```bash
python build_search_database.py
```

### Run the site locally

Because the page loads JSON via `fetch`, serve the repository with a local web server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## GitHub Pages Deployment

This repository includes `.github/workflows/deploy.yml`.

On every push to `main`, the workflow:

1. checks out the repository
2. packages the committed static site files
3. packages the committed JSON files in `database/`
4. deploys the artifact to GitHub Pages

GitHub Actions does not rebuild the JSON files from Excel. The JSON files must be refreshed locally and committed before pushing.

The deployed `index.html` references `styles.css` and `app.js` with explicit `?v=` query versions for cache busting. Bump that version when frontend assets change.

To enable deployment in GitHub:

1. create or connect the GitHub repository
2. push this repository to GitHub
3. open repository `Settings` -> `Pages`
4. set `Source` to `GitHub Actions`

No frontend build toolchain is required.

## Maintenance Workflow

When the underlying curated data changes:

1. replace the local Excel workbooks in `source/`
2. run `python build_search_database.py`
3. preview locally with `python -m http.server 8000`
4. commit the updated JSON files and frontend files if needed
5. push to `main`

## Notes on Canonicalization

The browser does not run Python validation or external gene databases.

Instead, canonicalization is resolved during the local JSON build step. The frontend only consumes:

- `alias_lookup.json` for alias-to-canonical normalization
- `search_index.json` for lookup and autocomplete

This keeps the deployed site fully static.

## Documentation

Additional documentation is available in:

- `docs/USAGE.md`
- `docs/DEPLOYMENT.md`
