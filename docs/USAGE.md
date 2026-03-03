# Usage Guide

## Search Modes

### Auto

`Auto` infers the search type from the entered value.

Typical behavior:

- a known gene symbol or alias is treated as a gene query
- a string containing fusion separators is treated as a fusion query
- multi-word labels usually resolve as diagnoses

### Gene

Use `Gene` when the input is a single gene symbol or a known alias.

Returned result sections:

- `Known Aliases`
- `Related Diagnoses`
- `Fusion Partner Genes`

Examples:

- `HMGA2`
- `MKL2`
- `HMGIC`

### Diagnosis

Use `Diagnosis` when the input is a diagnosis label.

Returned result sections:

- `Related Genes`
- `Related Fusions`

Examples:

- `Nodular fasciitis`
- `Dermatofibrosarcoma protuberans`

### Fusion

Use `Fusion` when the input is a fusion pair.

Returned result sections:

- `Related Diagnoses`
- `Observed Fusion Labels`

Examples:

- `HMGA2::LPP`
- `HMGIC:MKL2`
- `LPP::HMGA2`

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

### Gene mode

Suggests:

- canonical genes
- known aliases

### Diagnosis mode

Suggests:

- diagnosis labels

### Fusion mode

Suggests fusion labels only after `::` is present.

This avoids noisy suggestions while the user is still typing the first gene.

### Auto mode

Suggests a combined set of:

- genes
- aliases
- diagnoses
- fusions, once `::` appears

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
