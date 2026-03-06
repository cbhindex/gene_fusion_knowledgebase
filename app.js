const state = {
  aliasLookup: {},
  searchIndex: null,
  ready: false,
};

const MERGED_GENE_GROUPS = [
  ['BCOR', 'BCORL1'],
  ['DUX4', 'DUX4L8'],
  ['FOS', 'FOSB', 'FOSL1'],
  ['KANSL1', 'KANSL1L'],
  ['STRN', 'STRN3'],
];

const mergedGeneLookup = MERGED_GENE_GROUPS.reduce((lookup, group) => {
  const normalizedGroup = group.map((gene) => gene.toUpperCase());
  normalizedGroup.forEach((gene) => {
    lookup[gene] = normalizedGroup;
  });
  return lookup;
}, {});

const elements = {
  form: document.getElementById('search-form'),
  input: document.getElementById('search-input'),
  suggestions: document.getElementById('suggestions'),
  results: document.getElementById('results'),
  statusBanner: document.getElementById('status-banner'),
  cardTemplate: document.getElementById('card-template'),
};

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeGeneToken(token) {
  return normalizeWhitespace(token).replace(/[\[\](){}.,;]+$/g, '');
}

function sortCaseInsensitive(values) {
  return [...values].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

function uniqueSorted(values) {
  return sortCaseInsensitive([...new Set(values.filter(Boolean))]);
}

function getMergeGroup(gene) {
  if (!gene) return null;
  return mergedGeneLookup[gene.toUpperCase()] || null;
}

function canonicalizeGene(token) {
  const cleaned = normalizeGeneToken(token);
  if (!cleaned) {
    return { original: cleaned, canonical: '', changed: false };
  }
  const canonical = state.aliasLookup[cleaned.toUpperCase()] || cleaned;
  return { original: cleaned, canonical, changed: canonical !== cleaned };
}

function inferMode(query) {
  const trimmed = normalizeWhitespace(query);
  if (!trimmed) {
    return 'gene';
  }
  if (looksLikeFusion(trimmed)) {
    return 'fusion';
  }
  if (state.aliasLookup[trimmed.toUpperCase()] || state.searchIndex.gene_key_lookup[trimmed.toLowerCase()]) {
    return 'gene';
  }
  if (state.searchIndex.diagnosis_key_lookup[trimmed.toLowerCase()]) {
    return 'diagnosis';
  }
  const hasWhitespace = /\s/.test(trimmed);
  return hasWhitespace ? 'diagnosis' : 'gene';
}

function looksLikeFusion(query) {
  return query.includes('::') || query.includes('--') || query.includes(':') || /^\s*[A-Za-z0-9][A-Za-z0-9.-]*\s*-\s*[A-Za-z0-9][A-Za-z0-9.-]*\s*$/.test(query);
}

function normalizeFusionInput(query) {
  const trimmed = normalizeWhitespace(query).replace(/[–—]/g, '-');
  let separator = null;
  let parts = null;

  if (trimmed.includes('::')) {
    separator = '::';
    parts = trimmed.split('::');
  } else if (trimmed.includes('--')) {
    separator = '--';
    parts = trimmed.split('--');
  } else if (/^\s*[A-Za-z0-9][A-Za-z0-9.-]*\s*:\s*[A-Za-z0-9][A-Za-z0-9.-]*\s*$/.test(trimmed)) {
    separator = ':';
    parts = trimmed.split(':');
  } else if (/^\s*[A-Za-z0-9][A-Za-z0-9.-]*\s*-\s*[A-Za-z0-9][A-Za-z0-9.-]*\s*$/.test(trimmed)) {
    separator = '-';
    parts = trimmed.split('-');
  }

  if (!parts || parts.length !== 2) {
    return null;
  }

  const left = canonicalizeGene(parts[0]);
  const right = canonicalizeGene(parts[1]);
  if (!left.canonical || !right.canonical) {
    return null;
  }

  const displayFusion = `${left.canonical}::${right.canonical}`;
  const searchKey = [left.canonical, right.canonical].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join('::');
  const normalizedPieces = [];
  if (separator !== '::') {
    normalizedPieces.push(`separator normalized to ::`);
  }
  if (left.changed) {
    normalizedPieces.push(`${left.original} -> ${left.canonical}`);
  }
  if (right.changed) {
    normalizedPieces.push(`${right.original} -> ${right.canonical}`);
  }
  return {
    raw: trimmed,
    displayFusion,
    searchKey,
    normalizedMessage: normalizedPieces.length ? `Input normalized: ${trimmed} -> ${displayFusion}` : '',
  };
}

function levenshtein(a, b) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

function getDirectMatchTier(labelLower, queryLower) {
  if (labelLower === queryLower) return 0;
  if (labelLower.startsWith(queryLower)) return 1;
  const tokens = labelLower.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => token.startsWith(queryLower))) return 2;
  return 3;
}

function rankCandidates(query, candidates, limit = 6) {
  const normalizedQuery = normalizeWhitespace(query).toLowerCase();
  if (!normalizedQuery) return [];
  const normalizedCandidates = candidates.map((candidate) => {
    const label = typeof candidate === 'string' ? candidate : candidate.label;
    const type = typeof candidate === 'string' ? 'item' : candidate.type;
    const target = typeof candidate === 'string' ? candidate : candidate.target || candidate.label;
    const lower = label.toLowerCase();
    return { label, type, target, lower };
  });

  const directMatches = normalizedCandidates
    .filter((candidate) => candidate.lower.includes(normalizedQuery))
    .map((candidate) => ({
      ...candidate,
      tier: getDirectMatchTier(candidate.lower, normalizedQuery),
      position: candidate.lower.indexOf(normalizedQuery),
    }));

  if (directMatches.length) {
    return directMatches
      .sort((a, b) => (
        a.tier - b.tier
        || a.position - b.position
        || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      ))
      .slice(0, limit)
      .map(({ label, type, target }) => ({ label, type, target }));
  }

  return normalizedCandidates
    .map((candidate) => {
      let score = levenshtein(normalizedQuery, candidate.lower);
      if (candidate.lower.startsWith(normalizedQuery)) score -= 3;
      return { label: candidate.label, type: candidate.type, target: candidate.target, score };
    })
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    .slice(0, limit);
}

function getAutocompleteItems(query) {
  if (!state.ready) return [];
  const trimmed = normalizeWhitespace(query);
  if (!trimmed) return [];

  const combined = [
    ...state.searchIndex.suggestions.genes.map((value) => ({ label: value, type: 'gene', target: value })),
    ...state.searchIndex.suggestions.aliases.map((item) => ({ label: item.alias, type: 'alias', target: item.alias })),
    ...state.searchIndex.suggestions.diagnoses.map((value) => ({ label: value, type: 'diagnosis', target: value })),
  ];
  if (trimmed.includes('::')) {
    combined.push(...state.searchIndex.suggestions.fusions.map((value) => ({ label: value, type: 'fusion', target: value })));
  }
  return rankCandidates(trimmed, combined);
}

function setStatus(message, isError = false) {
  if (!message) {
    elements.statusBanner.hidden = true;
    elements.statusBanner.textContent = '';
    return;
  }
  elements.statusBanner.hidden = false;
  elements.statusBanner.textContent = message;
  elements.statusBanner.style.borderColor = isError ? 'rgba(183, 79, 45, 0.4)' : '';
}

function clearResults() {
  elements.results.innerHTML = '';
}

function createCard(kicker, title, note = '') {
  const fragment = elements.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.result-card');
  card.querySelector('.card-kicker').textContent = kicker;
  card.querySelector('.card-title').textContent = title;
  const noteEl = card.querySelector('.card-note');
  if (note) {
    noteEl.hidden = false;
    noteEl.textContent = note;
  }
  return card;
}

function appendListSection(card, title, items, emptyMessage) {
  const section = document.createElement('section');
  section.className = 'result-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = emptyMessage;
    section.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'token-list';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    section.appendChild(list);
  }
  card.querySelector('.card-body').appendChild(section);
}

function appendDiagnosisGeneSection(card, genes, highlightedGenes) {
  const section = document.createElement('section');
  section.className = 'result-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Related Genes';
  section.appendChild(heading);

  if (!genes.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'No genes found';
    section.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'token-list';
    genes.forEach((gene) => {
      const li = document.createElement('li');
      li.textContent = gene;
      if (highlightedGenes.has(gene)) {
        li.classList.add('main-fusion-gene');
      }
      list.appendChild(li);
    });
    section.appendChild(list);
  }

  const note = document.createElement('p');
  note.className = 'section-note';
  if (highlightedGenes.size === 1) {
    note.textContent = 'Main fusion gene is highlighted.';
  } else if (highlightedGenes.size >= 2) {
    note.textContent = 'Main fusion genes are highlighted.';
  } else {
    note.textContent = 'No main fusion gene is highlighted for this diagnosis.';
  }
  section.appendChild(note);

  card.querySelector('.card-body').appendChild(section);
}

function extractFusionGenesForCounting(fusionLabel) {
  const normalized = normalizeWhitespace(fusionLabel);
  if (!normalized.includes('::')) return null;
  const parts = normalized.split('::', 2);
  if (parts.length !== 2) return null;
  const left = normalizeGeneToken(parts[0]);
  const right = normalizeGeneToken(parts[1]);
  if (!left || !right) return null;
  return [left, right];
}

function getDiagnosisMainFusionGenes(fusions) {
  const uniquePairs = new Map();
  fusions.forEach((fusionLabel) => {
    const genes = extractFusionGenesForCounting(fusionLabel);
    if (!genes) return;
    const sortedPair = [...genes].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    uniquePairs.set(sortedPair.join('::'), sortedPair);
  });

  if (uniquePairs.size < 2) return [];

  const geneCounts = {};
  uniquePairs.forEach((pairGenes) => {
    pairGenes.forEach((gene) => {
      geneCounts[gene] = (geneCounts[gene] || 0) + 1;
    });
  });

  const counts = Object.values(geneCounts);
  if (!counts.length) return [];
  const maxCount = Math.max(...counts);
  if (maxCount < 2) return [];

  return Object.keys(geneCounts)
    .filter((gene) => geneCounts[gene] === maxCount)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function appendDidYouMean(card, items) {
  if (!items.length) return;
  const section = document.createElement('section');
  section.className = 'result-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Did you mean';
  section.appendChild(heading);
  const wrap = document.createElement('div');
  wrap.className = 'did-you-mean';
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.addEventListener('click', () => {
      elements.input.value = item.target;
      executeSearch();
    });
    wrap.appendChild(button);
  });
  section.appendChild(wrap);
  card.querySelector('.card-body').appendChild(section);
}

function appendAliasesByGene(card, geneRecords) {
  const section = document.createElement('section');
  section.className = 'result-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Aliases / Old Names by Gene';
  section.appendChild(heading);

  const groupWrap = document.createElement('div');
  groupWrap.className = 'alias-groups';
  const sortedRecords = [...geneRecords].sort((left, right) => left.gene.localeCompare(right.gene, undefined, { sensitivity: 'base' }));
  sortedRecords.forEach((record) => {
    const block = document.createElement('article');
    block.className = 'alias-group';
    const geneLabel = document.createElement('p');
    geneLabel.className = 'alias-gene-label';
    geneLabel.textContent = record.gene;
    block.appendChild(geneLabel);

    if (!record.aliases.length) {
      const empty = document.createElement('p');
      empty.className = 'list-empty';
      empty.textContent = 'No aliases recorded';
      block.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'token-list';
      record.aliases.forEach((alias) => {
        const li = document.createElement('li');
        li.textContent = alias;
        list.appendChild(li);
      });
      block.appendChild(list);
    }
    groupWrap.appendChild(block);
  });
  section.appendChild(groupWrap);
  card.querySelector('.card-body').appendChild(section);
}

function showNotFound(query, note) {
  clearResults();
  const card = createCard('No Match', 'No exact match found', note || '');
  appendListSection(card, 'Query', [query], '');
  appendDidYouMean(card, getAutocompleteItems(query));
  elements.results.appendChild(card);
}

function searchGene(query) {
  const canonicalized = canonicalizeGene(query);
  const key = state.searchIndex.gene_key_lookup[canonicalized.canonical.toLowerCase()] || canonicalized.canonical;
  const record = state.searchIndex.gene_lookup[key];
  if (!record) {
    showNotFound(query, canonicalized.changed ? `Input normalized: ${canonicalized.original} -> ${canonicalized.canonical}` : '');
    return;
  }

  const mergeGroup = getMergeGroup(record.gene);
  if (mergeGroup) {
    const mergeRecords = mergeGroup
      .map((gene) => {
        const mergeKey = state.searchIndex.gene_key_lookup[gene.toLowerCase()] || gene;
        return state.searchIndex.gene_lookup[mergeKey];
      })
      .filter(Boolean);

    if (mergeRecords.length) {
      const mergedGenes = uniqueSorted(mergeRecords.map((item) => item.gene));
      const mergedDiagnoses = uniqueSorted(mergeRecords.flatMap((item) => item.diagnoses));
      const mergedPartners = uniqueSorted(mergeRecords.flatMap((item) => item.partner_genes));

      clearResults();
      const noteParts = [];
      if (canonicalized.changed) {
        noteParts.push(`Input normalized: ${canonicalized.original} -> ${record.gene}`);
      }
      noteParts.push('Merged group result (whitelist enabled).');
      const card = createCard('Gene (Merged Group)', record.gene, noteParts.join(' '));
      appendListSection(card, 'Merge Source Genes', mergedGenes, 'No merged genes found');
      appendListSection(card, 'Related Diagnoses', mergedDiagnoses, 'No diagnoses found');
      appendListSection(card, 'Fusion Partner Genes', mergedPartners, 'No partner genes found');
      appendAliasesByGene(card, mergeRecords);
      elements.results.appendChild(card);
      return;
    }
  }

  clearResults();
  const note = canonicalized.changed ? `Input normalized: ${canonicalized.original} -> ${record.gene}` : '';
  const card = createCard('Gene', record.gene, note);
  if (record.aliases.length) {
    appendListSection(card, 'Known Aliases', record.aliases, 'No aliases recorded');
  }
  appendListSection(card, 'Related Diagnoses', record.diagnoses, 'No diagnoses found');
  appendListSection(card, 'Fusion Partner Genes', record.partner_genes, 'No partner genes found');
  elements.results.appendChild(card);
}

function searchDiagnosis(query) {
  const normalized = normalizeWhitespace(query);
  const key = state.searchIndex.diagnosis_key_lookup[normalized.toLowerCase()];
  const record = key ? state.searchIndex.diagnosis_lookup[key] : null;
  if (!record) {
    showNotFound(query, '');
    return;
  }
  clearResults();
  const card = createCard('Diagnosis', record.diagnosis);
  const mainFusionGenes = new Set(getDiagnosisMainFusionGenes(record.fusions));
  appendDiagnosisGeneSection(card, record.genes, mainFusionGenes);
  appendListSection(card, 'Related Fusions', record.fusions, 'No fusions found');
  elements.results.appendChild(card);
}

function searchFusion(query) {
  const normalized = normalizeFusionInput(query);
  if (!normalized) {
    showNotFound(query, '');
    return;
  }
  const record = state.searchIndex.fusion_lookup[normalized.searchKey];
  if (!record) {
    showNotFound(query, normalized.normalizedMessage);
    return;
  }
  clearResults();
  const card = createCard('Fusion', record.fusion, normalized.normalizedMessage);
  appendListSection(card, 'Related Diagnoses', record.diagnoses, 'No diagnoses found');
  appendListSection(card, 'Observed Fusion Labels', record.observed_fusions, 'No observed labels found');
  elements.results.appendChild(card);
}

function executeSearch() {
  if (!state.ready) return;
  const rawQuery = elements.input.value;
  const trimmed = normalizeWhitespace(rawQuery);
  if (!trimmed) {
    setStatus('Enter a gene, diagnosis, or fusion to search.', true);
    clearResults();
    hideSuggestions();
    return;
  }
  hideSuggestions();
  setStatus('');
  const mode = inferMode(trimmed);
  if (mode === 'gene') {
    searchGene(trimmed);
    return;
  }
  if (mode === 'diagnosis') {
    searchDiagnosis(trimmed);
    return;
  }
  searchFusion(trimmed);
}

function hideSuggestions() {
  elements.suggestions.hidden = true;
  elements.suggestions.innerHTML = '';
  elements.input.setAttribute('aria-expanded', 'false');
}

function renderSuggestions(items) {
  if (!items.length) {
    hideSuggestions();
    return;
  }
  elements.suggestions.innerHTML = '';
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.setAttribute('role', 'option');
    button.innerHTML = `<span>${item.label}</span><span class="suggestion-type">${item.type}</span>`;
    button.addEventListener('click', () => {
      elements.input.value = item.target;
      hideSuggestions();
      elements.input.focus();
    });
    elements.suggestions.appendChild(button);
  });
  elements.suggestions.hidden = false;
  elements.input.setAttribute('aria-expanded', 'true');
}

function updateAutocomplete() {
  const items = getAutocompleteItems(elements.input.value);
  renderSuggestions(items);
}

async function loadData() {
  try {
    const [aliasResponse, indexResponse] = await Promise.all([
      fetch('./database/alias_lookup.json'),
      fetch('./database/search_index.json'),
    ]);
    state.aliasLookup = await aliasResponse.json();
    state.searchIndex = await indexResponse.json();
    state.ready = true;
    setStatus('Search index loaded.');
  } catch (error) {
    console.error(error);
    setStatus('Failed to load search data. Serve this folder with a local web server and try again.', true);
  }
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  executeSearch();
});

elements.input.addEventListener('input', updateAutocomplete);

document.addEventListener('click', (event) => {
  if (!elements.suggestions.contains(event.target) && event.target !== elements.input) {
    hideSuggestions();
  }
});

loadData();
