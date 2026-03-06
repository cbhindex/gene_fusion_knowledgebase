# Usage Guide

## Search Input

The page uses one search box with automatic type inference (no mode dropdown).

Typical behavior:

- a known gene symbol or alias is treated as a gene query
- an exact diagnosis label match is treated as a diagnosis query first, even if it contains fusion separators
- a value containing fusion separators is treated as a fusion query
- diagnosis labels are treated as diagnosis queries

Examples:

- gene: `HMGA2`, `MKL2`, `HMGIC`
- diagnosis: `Nodular fasciitis`
- fusion: `HMGA2::LPP`, `HMGIC:MKL2`, `LPP::HMGA2`

## Result Sections

### Gene query

- `Known Aliases` (or grouped alias sections for configured merged-gene groups)
- `Related Diagnoses (N)` in a single-column list
- long diagnosis lists can be expanded/collapsed with `Show all` / `Show less`
- `Fusion Partner Genes`
- click any item in `Related Diagnoses` or `Fusion Partner Genes` to run that item as a new search

### Diagnosis query

- `Related Genes`
- recurrent main fusion genes are highlighted in `Related Genes` when a gene recurs across at least two fusion pairs
- `Related Fusions`
- click any item in `Related Genes` to run that gene as a new search
- click any item in `Related Fusions` to run that fusion as a new search

### Fusion query

- `Related Diagnoses (N)` in a single-column list
- long diagnosis lists can be expanded/collapsed with `Show all` / `Show less`
- `Observed Fusion Labels`

## Normalization Rules

### Gene normalization

Historical symbols and aliases are normalized to canonical HGNC symbols.

Examples:

- `MKL2` -> `MRTFB`
- `HMGIC` -> `HMGA2`
- `C11orf95` -> `ZFTA`

When normalization occurs, the result card shows an `Input normalized` note.

### Fusion normalization

Fusion inputs are normalized in two ways:

1. gene symbols are canonicalized
2. common separator variants are converted to `::`

Accepted separators include:

- `::`
- `:`
- `-`
- `--`

Examples:

- `HMGIC:MKL2` -> `HMGA2::MRTFB`
- `HMGA2-LPP` -> `HMGA2::LPP`

### Direction-insensitive fusion search

Fusion lookup is order-insensitive.

These queries resolve to the same record:

- `HMGA2::LPP`
- `LPP::HMGA2`

The page may still show the canonical stored fusion label in the result title.

## Autocomplete Behavior

- Suggests a combined set of genes, aliases, and diagnoses while typing.
- Fusion suggestions are added only after `::` appears.
- Selecting a suggestion immediately runs search and displays results.
- Direct substring matches are prioritized, so long diagnosis names are still surfaced when partially typed.
- `Did you mean` suggestions use the same candidate pool.

## No Match Handling

If there is no exact match:

- the page displays `No exact match found`
- the page still shows normalization context when relevant
- the page offers `Did you mean` suggestions based on nearest candidates

## Updating the Data

When curated data changes:

1. replace the Excel files in `source/`
2. run `python build_search_database.py`
3. reload the local preview page or redeploy GitHub Pages

If frontend files changed (`app.js` or `styles.css`), bump the `?v=` query version in `index.html` so browsers fetch the latest assets.
