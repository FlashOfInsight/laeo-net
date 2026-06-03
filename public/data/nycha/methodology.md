# Methodology: PACT vs. Non-PACT NYCHA — Evictions, Rodent Inspections, 311 Complaints, and DOB Permits

**Produced:** 2026-05-03  
**Analyst:** laeoc  
**Output file:** `aggregate_execution_rates.csv`

---

## Overview

This document describes every step taken to compute eviction rates, rodent inspection
failure rates, and HPD 311 complaint volumes (per 1,000 residential units) for:

- **PACT developments** — NYCHA buildings converted to private management under the
  Permanent Affordability Commitment Together (RAD/PACT) program, filtered to
  "Construction Complete" and "Under Construction" status only
- **Non-PACT NYCHA** — all remaining publicly-managed NYCHA developments

Each year's rate uses a changing denominator that reflects how many units were in each
pool *at the end of that year*, as developments convert from NYCHA to PACT over time.

---

## Data Sources

### S1 — NYCHA PACT Dataset PDF
- **URL:** `https://www.nyc.gov/assets/nycha/downloads/pdf/PACT_Dataset.pdf`
- **Publisher:** NYC Housing Authority
- **Updated:** April 2026 (downloaded 2026-04-30)
- **Contents:** One row per development, with columns: development name, project name,
  conversion date (anticipated), total units, repair cost, status, developers,
  general contractor, property manager, social service provider
- **Used for:** List of active PACT developments, unit counts, property manager names,
  status filter

### S2 — NYCHA Residential Address Dataset
- **URL:** `https://data.cityofnewyork.us/resource/3ub5-4ph8.json`
- **Publisher:** NYC Housing Authority via NYC Open Data (Socrata)
- **Contents:** Building-level records for current NYCHA-managed buildings.
  Key fields: `development`, `address`, `zip_code`, `borough_block_lot` (BBL),
  `borough`, `block`, `lot`, `privately_managed`
- **Used for:** Initial attempt at PACT BBL lookup (abandoned — see §4.1);
  control group BBL lookup (superseded — see §4.3); address-normalization reference;
  **NYPD Phase 0b**: per-building lat/lon for the non-PACT spatial index (uniform 150m
  circles — see Step 13)

### S3 — NYCHA Development Data Book
- **URL:** `https://data.cityofnewyork.us/resource/evjd-dqpz.json`
- **Publisher:** NYC Housing Authority via NYC Open Data (Socrata)
- **Contents:** One row per development. Key fields: `development`, `borough`,
  `location_street_a/b/c/d`, `total_number_of_apartments`,
  `number_of_current_apartments`, `rad_transferred_date`, `private_management`
- **Used for:** RAD/PACT conversion dates (the primary source for annual
  denominator calculation); unit counts for non-PACT developments;
  cross-street addresses used in geosearch geocoding

### S4 — NYC MapPLUTO
- **URL:** `https://data.cityofnewyork.us/resource/64uk-42ks.json`
- **Publisher:** NYC Department of City Planning via NYC Open Data (Socrata)
- **Contents:** Tax lot–level property data. Key fields: `bbl`, `ownername`,
  `address`, `borough`, `unitsres`, `latitude`, `longitude`
- **Used for:** (a) Resolving BBLs for PACT developments via owner-name pattern
  matching; (b) Resolving the complete non-PACT NYCHA BBL set via the
  `NYC HOUSING AUTHORITY` owner name

### S5 — NYC Planning Geosearch API
- **URL:** `https://geosearch.planninglabs.nyc/v2/search`
- **Publisher:** NYC Department of City Planning (free, no key required)
- **Used for:** Geocoding cross-street intersections from S3 to lat/lon coordinates
  for spatial PLUTO bounding-box queries, as a fallback when owner-name search
  in PLUTO failed

### S6 — NYC Marshal Evictions
- **URL:** `https://data.cityofnewyork.us/resource/6z8x-wfk4.json`
- **Publisher:** NYC Department of Investigation via NYC Open Data (Socrata)
- **Updated:** Daily (last record in dataset: 2026-04-24)
- **Contents:** One row per executed eviction. Key fields: `bbl`, `docket_number`,
  `court_index_number`, `eviction_address`, `eviction_zip`, `executed_date`,
  `residential_commercial_ind`
- **Used for:** Primary numerator — count of executed evictions at PACT and
  non-PACT NYCHA BBLs, 2022–present

### S8 — DOHMH Rodent Inspection
- **URL:** `https://data.cityofnewyork.us/resource/p937-wjvj.json`
- **Publisher:** NYC Department of Health and Mental Hygiene via NYC Open Data (Socrata)
- **Contents:** One row per DOHMH rodent inspection. Key fields: `bbl`, `inspection_date`,
  `result`, `inspection_type`
- **Used for:** Rodent inspection failure rate analysis — annual rate of inspections
  failing specifically for rat activity at PACT vs. non-PACT NYCHA buildings

### S9 — NYC 311 Service Requests
- **URL:** `https://data.cityofnewyork.us/resource/erm2-nwe9.json`
- **Publisher:** NYC Office of Technology and Innovation via NYC Open Data (Socrata)
- **Contents:** One record per 311 service request city-wide. Key fields: `agency`,
  `complaint_type`, `bbl`, `created_date`, `closed_date`, `address_type`
- **Used for:** HPD housing complaint analysis at PACT developments — volume and type
  of complaints (Heat/Hot Water, Plumbing, Elevator, etc.) by year since conversion.
  Filtered to `agency = 'HPD'`; only post-conversion records attributed to PACT group.
  Non-PACT NYCHA excluded because residents use the NYCHA MyNYCHA app, not 311.

### S10 — DOB Job Application Filings
- **URL:** `https://data.cityofnewyork.us/resource/w9ak-ipjd.json`
- **Publisher:** NYC Department of Buildings via NYC Open Data (Socrata)
- **Contents:** One record per DOB job application. Key fields: `bbl`, `job_type`,
  `filing_status`, `filing_date`, `initial_cost`, `general_construction_work_type_`.
  Note: `initial_cost` is stored as text — Socrata's `sum()` aggregate rejects it;
  costs must be summed client-side. Several intuitive column names do not exist in
  this dataset: `job_status` (correct: `filing_status`), `work_type` (not a column;
  the dataset uses per-discipline columns such as `general_construction_work_type_`,
  `plumbing_work_type`, `sprinkler_work_type`, etc.).
- **Used for:** Capital investment signal at PACT developments — alteration job
  filing counts and declared construction costs post-conversion.

### S11 — HUD REAC Physical Inspection Scores (PHAS / NSPIRE / Multifamily)
- **URLs:**
  - PHAS/NSPIRE (PHA-level): `https://www.hud.gov/program_offices/public_indian_housing/reac/nass-phas`
  - Multifamily REAC (per-property XLS): `https://www.hud.gov/sites/default/files/Housing/documents/MF-Inspection-Report.xls`
- **Publisher:** U.S. Department of Housing and Urban Development
- **Contents:** Two separate datasets under the REAC umbrella:
  - **PHAS** (retired 2023): PHA-level composite score (0–100) combining physical
    (30 pts), financial (25 pts), management (25 pts), and capital fund (10 pts)
    components. One score per housing authority per inspection cycle. NYCHA = NY005.
  - **NSPIRE** (introduced 2024): Physical-only inspection protocol, 0–100. More
    stringent than PHAS; scores are not directly comparable across the transition.
  - **REAC Multifamily**: Per-property physical inspection scores for HUD-assisted
    multifamily housing including RAD/PACT-converted properties. Published as an
    XLS file (~26,000 rows nationally). Columns: property name, city, state, REMS
    ID, up to three inspection score/date pairs. No BBL or NYC address field.
- **Investigated but not used in any chart.** See Step 12 for a full account of
  why this data source was pursued and ultimately excluded from the analysis.

### S7 — OCA Housing Court Data (HDC S3 CSVs)
- **URL base:** `https://oca-2-dev.s3.amazonaws.com/public/`
- **Publisher:** NYS Office of Court Administration, processed and published by the
  OCA Data Collective (Housing Data Coalition, Right to Counsel Coalition, JustFix,
  ANHD, BetaNYC, UNHP)
- **Last updated:** 2026-04-26
- **Tables used:**
  - `oca_warrants.csv` — warrant issuance records including
    `enforcementofficerdocketnumber` (the join key to marshal data),
    `executiondate`, `executiontype`
  - `oca_index.csv` — case-level records: `indexnumberid`, `court`,
    `fileddate`, `classification` (Non-Payment / Holdover / etc.),
    `disposedreason`, `specialtydesignationtypes`, `firstpaper`, `status`
  - `oca_causes.csv` — cause of action per case: `indexnumberid`,
    `causeofactiontype`
- **Used for:** Enriching marshal records with case classification (Non-Payment
  vs. Holdover), disposition method, and court metadata
- **Key limitation:** The `indexnumberid` in OCA is an opaque XML ID assigned by
  the court system — it is **not** a hash of the human-readable court index number
  (format `NNNNNN/YY`) that appears in the marshal dataset. The join key is
  `marshal.docket_number` ↔ `oca_warrants.enforcementofficerdocketnumber`.

---

## Step 1 — Build the PACT Development Reference List

**Script:** `analyze.py` → `parse_pact_pdf()`, `clean_pact_df()`  
**Output:** `pact_reference.csv` (28 rows)

1. Download `PACT_Dataset.pdf` from S1.
2. Extract tables from all PDF pages using `pdfplumber.extract_tables()`.
3. Detect the header row by checking for keywords "development", "status", "units".
4. Normalize column names to snake_case. Key columns identified:
   - `development_name`, `status`, `total_units`, `property_manager`,
     `conversion_date`
5. Forward-fill `status`, `property_manager`, `conversion_date` across
   sub-development rows (the PDF groups related rows under a single parent row
   that carries those values).
6. Normalize status strings:
   - Contains "complete" → `"Construction Complete"`
   - Contains "under construction" → `"Under Construction"`
   - Contains "planning" or "engagement" → `"Planning and Engagement"`
7. **Filter:** Keep only `"Construction Complete"` and `"Under Construction"`.
   Exclude `"Planning and Engagement"` sites (not yet under private management).
8. Strip non-digit characters from `total_units` and convert to numeric.

**Result:** 28 active PACT developments, 146 excluded (Planning and Engagement).

**Audit check:** Open `pact_reference.csv`. Verify development names, unit counts,
and status values against the source PDF at the S1 URL.

---

## Step 2 — Attach Conversion Dates

**Script:** `analyze.py` → main flow  
**Source:** S3 (NYCHA Development Data Book, `rad_transferred_date` field)

1. Fetch all rows from S3 (`$limit=500`).
2. Normalize `development` field to uppercase and strip whitespace.
3. Join to `pact_reference.csv` on `development_name` (uppercase) =
   `development` (uppercase).
4. Use `rad_transferred_date` as the conversion date for denominator calculation.
5. Fall back to `total_number_of_apartments` from S3 for unit counts where the
   PDF value is missing.

**Matched:** All 28 PACT developments matched to S3 except 5 that lack a
`rad_transferred_date`: OCEAN HILL APARTMENTS, METRO NORTH PLAZA, MORRIS PARK
SENIOR CITIZENS HOME, BAY VIEW, CAMPOS PLAZA II. These 5 are **excluded from
both pools** in the annual rate calculation.

**Audit check:** In S3, query:  
`https://data.cityofnewyork.us/resource/evjd-dqpz.json?$where=rad_transferred_date IS NOT NULL&$select=development,rad_transferred_date,total_number_of_apartments`  
Confirm conversion dates for each PACT development name.

---

## Step 3 — Resolve BBLs for PACT Developments

**Script:** `analyze.py` → `resolve_pact_bbls()`

PACT developments have been removed from the NYCHA address dataset (S2) after
transfer to private management. BBLs must be resolved through PLUTO (S4).

### 3.1 — Automated PLUTO keyword search

For each PACT development:

1. Extract meaningful words from the development name, skipping generic terms
   (HOUSES, APARTMENTS, PARK, SECTION, etc.) and short words (< 3 characters).
2. For address-style names (e.g., "572 WARREN STREET"), skip the house number
   and use the street name words.
3. Query PLUTO: `upper(ownername) LIKE '%{keyword}%' AND borough='{boro}' AND unitsres >= 20`
4. Borough filter is derived from S3's `borough` field for that development.
5. Cap results at 40 BBLs when borough-filtered (15 without) to limit false positives.

### 3.2 — Hardcoded owner-name map (manual research)

For developments where automated keyword search failed, owner entity names were
identified through targeted PLUTO queries and added to a hardcoded map:

| PLUTO owner keyword | Development(s) |
|---|---|
| `OCEAN BAY RAD` | OCEAN BAY APARTMENTS (BAYSIDE) |
| `NYC PACT PRESERVATION PARTNERS` | 104-14 TAPSCOTT ST, OCEAN HILL APTS, BELMONT-SUTTER AREA |
| `PACT RENAISSANCE COLLABORATIVE` | MANHATTANVILLE, SAMUEL (CITY) |
| `CSA PRESERVATION PARTNERS` | EDENWALD |
| `SEWARD HOUSING` | SACK WERN |
| `MARKHAM GARDENS` | WEST BRIGHTON I |
| `BSC HOUSING COMPANY` | BAY VIEW |
| `METRO NORTH OWNERS` / `METRO NORTH GARDENS` | METRO NORTH PLAZA |
| `BOSTON TREMONT HOUSING` | BOSTON SECOR |
| `1018 E 163RD STREET HOUSING` | EAGLE AVENUE-EAST 163RD STREET |
| `437 MORRIS PARK` | MORRIS PARK SENIOR CITIZENS HOME |
| `1068 FRANKLIN AVE HOUSING` | FRANKLIN AVENUE I CONVENTIONAL |

All BBLs returned for each keyword (borough-filtered) are assigned to the
corresponding development(s).

### 3.3 — NYC Geosearch fallback

For developments where PLUTO keyword search returned nothing, the cross-street
intersection from S3 (`location_street_a` & `location_street_b`) was geocoded
using the S5 Geosearch API. The returned lat/lon was used to query PLUTO for
all residential lots within a ~120–400m bounding box.

### 3.4 — BBL coverage outcome

| Coverage status | Developments | Approximate units |
|---|---|---|
| BBLs resolved | 26 of 28 | ~15,700 |
| No BBLs found | 2 (335 E 111TH ST, FRANKLIN AVE I*) | ~127 |

*335 E 111TH STREET and FRANKLIN AVENUE I CONVENTIONAL had no recoverable PLUTO
match. Their executions cannot be counted; their units remain in the PACT
denominator.

**Note on shared-entity BBLs:** Several PACT developments share a single PLUTO
owner entity (e.g., NYC PACT PRESERVATION PARTNERS LLC owns lots attributed to
three separate developments). When a BBL appears in multiple developments' lists,
the development attribution in `pact_executions.csv` goes to whichever development
appears first after deduplication. This affects development-level attribution but
**not** the aggregate PACT totals, since all those BBLs are correctly included
in the PACT set.

**Audit check:** For each development, query PLUTO directly:  
`https://data.cityofnewyork.us/resource/64uk-42ks.json?$where=upper(ownername) LIKE '%{KEYWORD}%'&$select=bbl,ownername,address,unitsres`  
Confirm that the returned lots are plausibly associated with the named development
(address, borough, unit count).

---

## Step 3.5 — Manual BBL Verification

**Authoritative file:** `pact_bbl_master.csv`  
**Updated:** manually, development by development  
**Pipeline integration:** `analyze.py` → `load_bbl_master()` — any development with non-empty BBLs in this file overrides automated resolution; developments with no BBLs fall through to auto.

### Purpose

Automated PLUTO resolution (Steps 3.1–3.3) produces incorrect or incomplete results
for many PACT developments. Errors fall into two categories:

- **Overcounts:** the automated search pulls in lots that belong to a neighboring
  development, inflating the eviction numerator for one site and potentially
  deflating another.
- **Undercounts / missing:** only one lot of a multi-lot development is found, or
  no lots are found at all, causing evictions to be silently undercounted.

Manual verification cross-references PLUTO lot data against NYCHA building map PDFs
and known physical addresses to establish the correct, complete set of BBLs for each
development.

### Priority order (least to most confident)

Verification proceeds in this order within each tier:

**Tier 1 — Overcounts (actively wrong; most urgent)**

| # | Development | Issue |
|---|---|---|
| 1 | BAY VIEW | +8,027u over expected; BSC Housing lots include non-PACT buildings |
| 2 | EASTCHESTER GARDENS | +539u over; Eastchester Heights HDF covers both Gardens and Heights |

**Tier 2 — No BBLs found (development absent from analysis)**

| # | Development | Expected units |
|---|---|---|
| 3 | EAGLE AVENUE-EAST 163RD STREET | 66u |
| 4 | 104-14 TAPSCOTT STREET | 30u |
| 5 | MANHATTANVILLE | 1,272u |
| 6 | OCEAN HILL APARTMENTS | 236u |
| 7 | MORRIS PARK SENIOR CITIZENS HOME | 97u |
| 8 | CAMPOS PLAZA II | 224u |

**Tier 3 — Large unit gap (significantly incomplete)**

| # | Development | Gap |
|---|---|---|
| 9 | EDENWALD | -1,016u (only 1 BBL found) |
| 10 | BAYCHESTER | -369u (only 1 BBL found) |
| 11 | WEST BRIGHTON I | -250u (only 1 BBL found) |
| 12 | BOSTON SECOR | -241u (only 1 BBL found) |
| 13 | SACK WERN | -234u (only 1 BBL found) |
| 14 | METRO NORTH PLAZA | -227u (only 1 BBL found) |
| 15 | 1010 EAST 178TH STREET | -141u (only 1 BBL found) |
| 16 | 572 WARREN STREET | -132u (only 1 BBL found) |
| 17 | FRANKLIN AVENUE I CONVENTIONAL | -21u |

**Tier 4 — Auto-unreviewed (automated result, not yet confirmed)**

| # | Development | Unit gap | Current BBLs |
|---|---|---|---|
| 18 | TWIN PARKS WEST (SITES 1 & 2) | -38u | 2031000065, 2031010023 |
| 19 | HARLEM RIVER | -4u | 1020160060, 1020370011 |
| 20 | 335 EAST 111TH STREET | 0u | 1016830018 |
| 21 | OCEAN BAY APARTMENTS (BAYSIDE) | 0u | 4160010002, 4160020001 |

**Already confirmed (skip):** BETANCES I, BUSHWICK II (GROUPS A & C), BELMONT-SUTTER
AREA, LINDEN, WILLIAMSBURG, AUDUBON, SAMUEL (CITY)

### Verification procedure (per development)

1. Look up current PLUTO data for all BBLs in `pact_bbl_master.csv`:  
   `https://data.cityofnewyork.us/resource/64uk-42ks.json?$where=bbl='XXXXXXXXXX'&$select=bbl,ownername,address,unitsres`
2. Cross-reference with NYCHA building map PDFs (nyc.gov/nycha → developments) or
   the NYCHA Development Portal.
3. For missing lots: search PLUTO by address or owner name to find additional BBLs.
4. Accept/reject/replace BBLs in `pact_bbl_master.csv`:
   - Update `bbls` (pipe-separated)
   - Update `bbl_count`
   - Update `pluto_units` and `unit_gap`
   - Set `review_status` to `confirmed`
   - Add a `notes` entry describing what was added, removed, or accepted

### How `pact_bbl_master.csv` drives the pipeline

When `analyze.py` runs, `load_bbl_master()` reads this file and overrides
the automated PLUTO/Geosearch resolution for any development that has BBLs recorded.
To re-run the pipeline after updating verified BBLs, simply run `python analyze.py`.

---

## Step 4 — Resolve BBLs for Non-PACT NYCHA (Control Group)

**Script:** standalone query at pipeline runtime  
**Output:** `control_bbls_pluto.csv` (651 rows)

1. Query PLUTO for all lots owned by NYC Housing Authority:  
   `upper(ownername) LIKE '%HOUSING AUTHORITY%' AND unitsres > 0`
2. This returns 651 lots totalling 176,766 residential units.
3. Verify zero overlap with PACT BBLs (confirmed: 0 overlap). Because PACT
   transfers change the PLUTO owner from NYC Housing Authority to the new private
   entity, the two sets are mutually exclusive by construction.

**Rationale for using PLUTO over the NYCHA address dataset (S2):**  
S2 only covered 218 of 245 non-PACT developments (~89%). PLUTO's owner-name
query is complete by definition — any lot still owned by NYC Housing Authority
is non-PACT NYCHA, and any transferred lot will no longer carry that owner name.

**Audit check:** Query PLUTO directly and confirm the count:  
`https://data.cityofnewyork.us/resource/64uk-42ks.json?$select=count(*)&$where=upper(ownername) LIKE '%HOUSING AUTHORITY%' AND unitsres > 0`  
Should return ~651 rows and ~176,766 total units.

---

## Step 5 — Fetch Marshal Eviction Data

**Script:** `analyze.py` → `fetch_marshal_evictions()`  
**Source:** S6

1. Query the Socrata API with filter:  
   `executed_date >= '2022-01-01' AND (residential_commercial_ind = 'Residential' OR residential_commercial_ind = 'R')`
2. Paginate in batches of 50,000 rows (`$limit/$offset`).
3. Normalize `bbl` field: strip non-digits, keep only if exactly 10 characters.
4. Parse `executed_date` to datetime; extract `year`.
5. Normalize `eviction_address` with `normalize_addr()` (lowercase, expand
   abbreviations, collapse whitespace) for potential fallback matching.

**Result:** 54,697 residential eviction records, 2022–2026-04-24.

**Audit check:** Count residential evictions in S6 directly:  
`https://data.cityofnewyork.us/resource/6z8x-wfk4.json?$select=count(*)&$where=executed_date >= '2022-01-01' AND (residential_commercial_ind = 'Residential' OR residential_commercial_ind = 'R')`

---

## Step 6 — Split Marshal Evictions into PACT and Control

**Script:** `analyze.py` → main flow

1. Build `pact_bbls`: the set of all BBLs resolved in Step 3.
2. Build `control_bbls`: all 651 BBLs from `control_bbls_pluto.csv`.
3. Split the full marshal dataset:
   - `pact_exec`: rows where `bbl ∈ pact_bbls` → **659 rows**
   - `control_exec`: rows where `bbl ∈ control_bbls` → **729 rows**
4. Annotate `pact_exec` rows with `development_name`, `status_normalized`,
   `property_manager` via a `{bbl → development}` lookup built from the
   resolved PACT BBL table.

**Audit check:** For any row in `pact_executions.csv`, take its `bbl` value and
confirm that BBL appears in the PACT owner-name search output for the named
development. For any row in `control_executions.csv`, confirm the BBL returns
"NYC HOUSING AUTHORITY" as owner in PLUTO.

---

## Step 7 — Enrich with OCA Case Classification

**Script:** `analyze.py` (post-processing) and interactive session  
**Sources:** S7 (oca_warrants, oca_index, oca_causes)  
**Output:** `oca_docket_lookup.csv`; enriched `pact_executions.csv` and
`control_executions.csv`

### Join chain

```
marshal.docket_number
  → oca_warrants.enforcementofficerdocketnumber   [latest executiondate per docket]
  → oca_warrants.indexnumberid
  → oca_index.classification                      (Non-Payment / Holdover / etc.)
  → oca_index.disposedreason                      (judgment type and stay status)
  → oca_index.specialtydesignationtypes           (NYCHA flag, Nuisance flag, etc.)
  → oca_causes.causeofactiontype                  (same-level as classification
                                                   for most cases; concatenated
                                                   with " | " if multiple rows)
```

### Steps

1. Normalize `docket_number` in marshal data: strip to integer string
   (e.g., `"027767"` → `"27767"`).
2. Stream `oca_warrants.csv` in 100k-row chunks. For each chunk:
   - Normalize `enforcementofficerdocketnumber` to integer string.
   - Filter to rows whose docket string is in the marshal docket set.
3. From matched warrant rows, keep **one row per docket** by selecting the row
   with the **latest `executiondate`** (most recent warrant action).
4. Collect the `indexnumberid` values from Step 3.
5. Stream `oca_index.csv`, filter to matched `indexnumberid` values, keep
   one row per case (deduplicated).
6. Stream `oca_causes.csv`, filter to matched IDs. Aggregate per case:
   concatenate all `causeofactiontype` values with `" | "`.
7. Apply `bucket_disposition()` to `disposedreason` to create
   `disposition_bucket`:

   | Raw disposedreason contains | Bucket |
   |---|---|
   | "No Execution Stay" or "Execution Stayed 0 days" | Judgment - Immediate |
   | "Stipulation" or "Stip" | Judgment - Stipulation |
   | "Failure to Appear" or "Failure to Answer" | Judgment - Failure to Appear |
   | "Inquest" | Judgment - Inquest |
   | "Trial" or "Hearing" or "Decision" | Judgment - Contested |
   | "Dismissed" | Dismissed |
   | "Settled" | Settled |
   | "Execution Stayed" | Judgment - Stayed |
   | None of the above | Other |

8. Flag `flagged_nycha_in_court = True` if `specialtydesignationtypes`
   contains "NYCHA".

**Match rate:** 1,370 of 1,372 unique marshal dockets matched to OCA warrants
(99.9%). Of those, 1,304 matched to `oca_index` (the remaining 66 have warrant
records but no corresponding index entry, likely very old cases pre-dating the
OCA digital records).

**Audit check:** Pick any row in `pact_executions.csv` where `classification`
is populated. Take `docket_number` and search `oca_warrants.csv` for that value
in `enforcementofficerdocketnumber`. Confirm the `indexnumberid` matches. Then
search `oca_index.csv` for that `indexnumberid` and confirm `classification`
matches.

---

## Step 8 — Compute Annual Unit Denominators

**Script:** `aggregate_execution_rates.csv` generation  
**Sources:** S1 (PACT unit counts), S3 (conversion dates + unit counts), S4 (PLUTO unit counts)

### PACT denominator (per year)

For each year Y:

```
PACT_units(Y) = sum of units_final for all developments where
                rad_transferred_date ≤ Dec 31 of year Y
```

`units_final` = `total_units` from S1 (PACT PDF), falling back to
`total_number_of_apartments` from S3 when the PDF value is missing.

Developments without a `rad_transferred_date` in S3 (5 developments; see Step 2)
are **excluded** — not counted in PACT units for any year.

### Non-PACT NYCHA denominator (per year)

For each year Y:

```
non_PACT_units(Y) = 176,766   [current PLUTO NYCHA-owned total]
                  + sum of units_final for PACT developments where
                    rad_transferred_date > Dec 31 of year Y
```

The logic: PLUTO reflects the current state (post-all-transfers). For past years,
those buildings had not yet been transferred, so their units belonged to the
non-PACT pool. Adding them back reconstructs the historical non-PACT universe.

**Audit check:** For year 2023, manually sum:
- 176,766 (current PLUTO non-PACT total)
- Plus units for developments with `rad_transferred_date` in 2024 and 2025
- Should equal the `Non-PACT units` column value for 2023 in
  `aggregate_execution_rates.csv`

---

## Step 9 — Compute Annual Rates

**Script:** `aggregate_execution_rates.csv` generation

For each year Y, for each group G ∈ {PACT, Non-PACT NYCHA}:

```
executions(G, Y)  = count of rows in {pact,control}_executions.csv
                    where year == Y

units(G, Y)       = denominator from Step 8

rate(G, Y)        = executions(G, Y) / units(G, Y) × 1,000
```

**2026 is flagged as YTD.** The denominator is the same as 2025 (no new
conversions have been recorded in S3 after 2025-06-24 as of the data pull date).
The OCA data has an approximately 4–6 week reporting lag; marshal data is
current to 2026-04-24.

---

## Final Output Table

`aggregate_execution_rates.csv`

| Year | PACT devs | PACT units | PACT exec | PACT /1k | Non-PACT units | Non-PACT exec | Non-PACT /1k | Ratio |
|---|---|---|---|---|---|---|---|---|
| 2022 | 12 | 6,940 | 28 | 4.03 | 183,538 | 8 | 0.04 | 100.8× |
| 2023 | 16 | 9,238 | 107 | 11.58 | 181,240 | 82 | 0.45 | 25.7× |
| 2024 | 21 | 12,615 | 196 | 15.54 | 177,863 | 273 | 1.53 | 10.2× |
| 2025 | 23 | 13,712 | 230 | 16.77 | 176,766 | 333 | 1.88 | 8.9× |
| 2026 YTD | 23 | 13,712 | 98 | 7.15 | 176,766 | 121 | 0.68 | 10.5× |

---

## Step 10 — Rodent Inspection Failure Rate Analysis

**Script:** `pact_rodent.py`  
**Source:** S8 (DOHMH Rodent Inspection)  
**Outputs:** `pact_rodent.csv`, `ctrl_rodent.csv`, `data/rodent_aggregate.json`,
`developments.geojson` (enriched with `rodent_data` per PACT feature)

### 10.1 — Fetch PACT rodent inspections

1. For each BBL in the PACT BBL master list, query S8:  
   `$where=bbl in(bbl1,bbl2,...) AND inspection_date >= '2010-01-01'`  
   Batch in groups of up to 50 BBLs to respect URL length limits.
2. Normalize `bbl` to a 10-character zero-padded string.
3. Join each record to its development name via the PACT BBL master.
4. Apply **date-aware routing**: for each BBL, drop inspections that occurred
   *before* that development's `rad_transferred_date` (the NYCHA → PACT
   conversion date from S3). Only post-conversion inspections at PACT BBLs
   enter the PACT aggregate; pre-conversion inspections at those same BBLs
   are excluded entirely (they belong to a period when the building was still
   NYCHA-managed and would double-count with the control group).
5. Write `pact_rodent.csv` (5,258 records, all 29 PACT developments).

### 10.2 — Fetch non-PACT rodent inspections

1. For each BBL in `ctrl_bbls_pluto.csv` (771 NYCHA-owned lots), query S8 in
   batches of 50 BBLs.
2. Normalize `bbl`; drop records with no matching BBL.
3. Write `ctrl_rodent.csv` (23,391 records).

### 10.3 — Compute annual failure rates

For each group G ∈ {PACT, non-PACT} and each year Y:

```
total_inspections(G, Y) = count of rows in the group's rodent CSV where
                          inspection_date falls in year Y

rat_fails(G, Y)         = count of rows where result contains "RAT ACTIVITY"
                          (case-insensitive substring match)

fail_rate_pct(G, Y)     = rat_fails / total_inspections × 100
```

**Minimum threshold:** if `total_inspections(G, Y) < 5`, the period is
suppressed and recorded as `null` in `rodent_aggregate.json`. This avoids
noisy single-inspection data points, particularly for the PACT group in early
post-conversion years (2019–2021).

**Result:** The PACT aggregate line is null for 2010–2018 (fewer than 5
post-conversion inspections in those years combined across all converted
developments) and begins in 2019 (31.2% failure rate, 16 inspections).

### 10.4 — Per-development enrichment

For each PACT development with at least one post-conversion rodent inspection,
a `rodent_data` property is added to its feature in `developments.geojson`:

```json
{
  "total_inspections": <int>,
  "total_rat_fails": <int>,
  "fail_rate_pct": <float>,
  "by_year": {
    "2022": { "inspections": <int>, "rat_fails": <int>, "fail_rate_pct": <float> },
    ...
  }
}
```

**Audit check:** For any PACT development in `pact_rodent.csv`, filter to its
rows, count total rows, count rows where `result` contains "RAT ACTIVITY", and
confirm the ratio matches the `fail_rate_pct` in `developments.geojson`.

---

## Step 11 — HPD 311 Complaint Analysis (PACT Developments Only)

**Script:** `pact_311.py`  
**Source:** S9 (NYC 311 Service Requests, HPD agency filter)  
**Outputs:** `pact_311.csv`, `data/complaints_agg.json`,
`developments.geojson` (enriched with `complaint_data` per PACT feature)

### 11.1 — Fetch conversion dates and BBL map

1. Fetch `rad_transferred_date` for all PACT developments from S3 (same as Step 2).
2. Load `pact_bbl_master.csv` to build a `{bbl → development_name}` lookup and
   a `{development_name → conversion_date}` lookup.

### 11.2 — Fetch HPD 311 complaints for all PACT BBLs

For each development's BBL set:

1. Query S9 with filter:  
   `$where=bbl in(bbl1,...) AND agency='HPD'`  
   Paginate until exhausted; timeout 45 seconds per request with 3 retries.
2. Filter to records where `bbl` is non-null and `agency = 'HPD'`.
3. Apply **date-aware routing**: drop any complaint whose `created_date` is
   before the development's `rad_transferred_date`. Pre-conversion HPD complaints
   (if any) are excluded from PACT attribution.
4. Write `pact_311.csv` (18,295 records across 23 developments with matched BBLs
   and conversion dates).

**Note:** Non-PACT NYCHA is excluded from this pipeline entirely. Tenants at
publicly managed NYCHA buildings report issues through the NYCHA MyNYCHA app and
internal work-order system, not 311. HPD does not proactively inspect NYCHA-managed
buildings — it only has jurisdiction over privately managed housing. This asymmetry
makes a PACT vs. non-PACT 311 comparison invalid; see L9.

### 11.3 — Build years-since-conversion aggregate

For each PACT development D with a known `conversion_date`:

1. Assign each complaint a `conv_year` offset: `year(created_date) − year(conversion_date)`.
   Year 0 = the calendar year of conversion; Year 1 = first full year under private
   management; etc.
2. Pool all developments by `conv_year` offset. For each offset Y:
   ```
   total_complaints(Y) = sum of complaints across all devs at offset Y
   total_units(Y)      = sum of units for those same devs
   per_1k(Y)           = total_complaints / total_units × 1,000
   dev_count(Y)        = number of developments contributing data at offset Y
   ```
3. **Minimum threshold:** suppress offsets with `dev_count < 3` to avoid
   single-development noise.
4. Write `data/complaints_agg.json` (9 year-offset buckets, Year 0–8).

**Result:** Year 0 (conversion year) shows 107.8 complaints/1k units (11 devs).
Year 1 spikes to 394.8/1k (18 devs — first full year under HPD jurisdiction).
Years 2–8 settle in the 180–285/1k range.

### 11.4 — Per-development enrichment

For each development in `pact_311.csv`, a `complaint_data` property is added to its
feature in `developments.geojson`:

```json
{
  "total": <int>,
  "conv_year": <int>,
  "by_year": {
    "2021": { "complaints": <int>, "per_1k": <float> },
    ...
  },
  "monthly": { "2021-06": <int>, ... },
  "top_types": [
    { "type": "HEAT/HOT WATER", "count": <int> },
    ...
  ]
}
```

**Audit check:** For any PACT development in the map panel, toggle to the
"311 Complaints" tab. The monthly bar chart should start at the development's
conversion date. The complaint count in the panel header should match the sum of
all `monthly` values in `developments.geojson` for that development.

---

## Known Limitations and Caveats

### L1 — Incomplete PACT BBL coverage
2 of 28 active PACT developments (335 EAST 111TH STREET, 61 units; and
FRANKLIN AVENUE I CONVENTIONAL, 61 units; ~127 units combined) have no
resolved BBLs. Executions at those addresses are not captured in
`pact_executions.csv`. Their units are included in the PACT denominator,
which understates the true PACT rate by a small margin.

### L2 — Shared-entity BBLs
Three Brooklyn developments (104-14 TAPSCOTT STREET, OCEAN HILL APARTMENTS,
BELMONT-SUTTER AREA) share the PLUTO entity "NYC PACT PRESERVATION PARTNERS LLC."
Two Manhattan developments (MANHATTANVILLE, SAMUEL (CITY)) share "PACT RENAISSANCE
COLLABORATIVE LLC." Within `pact_executions.csv`, each BBL is attributed to one
development only (first-match deduplication). The aggregate PACT counts and rates
are unaffected.

### L3 — PLUTO snapshot is current, not historical
PLUTO reflects ownership as of the data pull (2026-04-30). A development that
converted in, say, late 2025 may appear as private-entity-owned in PLUTO now,
meaning its buildings are correctly excluded from the non-PACT NYCHA BBL set.
However, if any PACT transfer had not yet updated in PLUTO at the time of the
pull, those lots would appear in both the PACT denominator (via S3 conversion
date) and the non-PACT BBL numerator (via PLUTO owner search) — a minor
double-counting risk. Zero overlap was confirmed at pull time.

### L4 — 2022 ratio is not reliable
Only 12 PACT developments were active in 2022, most converted in 2016–2019.
Post-moratorium dynamics (courts reopening after COVID closures) produced a
spike in eviction activity concentrated in those early-converted sites. The
134× ratio for 2022 should not be interpreted as a stable signal.

### L5 — OCA filing data not available at development level
The HDC/OCA pre-processed CSVs carry respondent mailing ZIP codes but no
street-level property address. Development-level filing rate analysis (as
distinct from execution rate) is therefore not feasible with this data pipeline.
The file `oca_borough_summary.csv` provides borough-level OCA filing counts
(Non-Payment, Holdover, other) as contextual information only.

### L6 — OCA holdover sub-type not available
`oca_causes.causeofactiontype` stores "Holdover" as a single undifferentiated
value for all holdover proceedings in our matched set. The specific grounds
(lease expiration, unauthorized occupant, licensee, nuisance, etc.) are encoded
in predicate notice documents attached to case files, which are not structured
fields in the OCA electronic system or the HDC-published CSVs.

### L7 — Non-PACT NYCHA denominator uses current PLUTO unit counts
The 176,766 figure comes from PLUTO's current snapshot of NYCHA-owned units.
Actual unit counts in past years may differ slightly due to demolitions,
new construction, or unreported changes not yet reflected in PLUTO. S3's
`total_number_of_apartments` could be used as an alternative denominator source
for non-PACT developments; the two sources agree within ~2%.

### L8 — Rodent inspection frequency is not uniform across time or tenure type
DOHMH expanded its proactive inspection program significantly after 2017.
Non-PACT NYCHA received 474 inspections in 2010 versus 3,249 in 2022 — a 6×
increase. Because failure rate (not raw count) is used as the metric, this
expansion does not directly inflate reported rates, but differential inspection
intensity at PACT vs. non-PACT sites, or at buildings that have recently changed
management, may still introduce bias. The PACT aggregate line is based on fewer
than 200 post-conversion inspections total in 2019–2021, which limits statistical
confidence in those early years.

### L9 — HPD 311 complaints are not available for non-PACT NYCHA
NYC Housing Authority tenants report maintenance issues through the MyNYCHA app
and NYCHA's internal work-order system. HPD does not have jurisdiction over
publicly managed NYCHA buildings and does not receive or dispatch complaints for
those addresses. As a result, 311 complaint volume at non-PACT NYCHA BBLs reflects
near-zero data — not an absence of problems. The 311 pipeline is therefore PACT-only,
and the "HPD 311 Complaints" chart shows a years-since-conversion trajectory rather
than a PACT vs. non-PACT comparison.

---

## Step 12 — HUD REAC Investigation (Data Explored, Not Used)

**Script:** none — fully manual; data stored in `data/reac_scores.json`  
**Sources:** S11  
**Outcome:** Investigated and rejected. No chart was published. Documented here
for reproducibility and to explain why a seemingly ideal data source was not used.

### 12.1 — Motivation

HUD's REAC inspection program is the only standardized, government-administered
physical conditions assessment that covers both public NYCHA buildings (via PHAS/NSPIRE)
and PACT-converted properties (via REAC Multifamily). In theory it offers an
apples-to-apples physical conditions comparison — the one metric not distorted by
the enforcement-regime asymmetry that affects HPD violations and 311 complaints
(see L9). This made it a high-priority data source to investigate.

### 12.2 — What was found

**NYCHA (non-PACT) scores — PHA-level only, via PHAS/NSPIRE:**

HUD's PHAS score file for NY005 (NYCHA's PHA identifier) contains only five usable
data points between 2015 and 2024:

| Year | Score | System | Notes |
|------|-------|--------|-------|
| 2015 | 84 | PHAS | From HUD PHAS file (NY005) |
| 2019 | 67 | PHAS | From HUD PHAS file (NY005) |
| 2020 | — | PHAS | COVID inspection waiver |
| 2021 | — | PHAS | COVID inspection waiver |
| 2022–23 | 35 | NSPIRE | City Limits / NYCHA Now reporting |
| 2024 | 63 | NSPIRE | City Limits / NYCHA Now reporting |

PHAS is a composite score — only 30 of 100 points come from the physical inspection;
the rest cover financial health, management operations, and capital fund spending.
NSPIRE (the 2024 replacement) is physical-only and designed to be more stringent.
The apparent drop from 67 (PHAS, 2019) to 35 (NSPIRE, 2022–23) reflects both
genuine deterioration and a measurement change; the two scores cannot be placed on
the same scale.

**PACT-converted sites — REAC Multifamily, per-property:**

The HUD multifamily inspection file (`MF-Inspection-Report.xls`, ~26,000 rows
nationally) contains per-property REAC scores for all HUD-assisted multifamily
housing. It has no BBL field and no structured NYC address. The only joinable
fields are property name, city, and state.

Searching the file for Brooklyn/Manhattan/Bronx/Queens properties with names
resembling PACT developments, three approximate matches were found:

| HUD property name | Approximate PACT match | Scores |
|---|---|---|
| WILLIAMSBURG APARTMENTS | Williamsburg | 96 (Feb 2022), 95 (May 2025) |
| LINDEN BOULEVARD DEVELOPMENT | Linden | 69 (Nov 2021), 86 (Jan 2023) |
| 1041 BUSHWICK AVENUE APTS | Bushwick II (Groups A & C) | 97 (Jul 2021), 86 (Apr 2025) |

Addresses were not confirmed. Multiple attempts to resolve REMS IDs to addresses
via HUD's EGIS API, services.hud.gov, and the HUD ARCGIS endpoint all returned
404 or empty results.

### 12.3 — Why the data was rejected

Three compounding problems made charting the REAC data inadvisable:

**1. Sparseness.** NYCHA has five data points across nine years. REAC inspections
are not conducted annually for every PHA — NYCHA had documented scores only in 2015
and 2019 before COVID waivers halted inspections for two years. The PACT multifamily
data is even thinner: three properties, two inspections each, spread across 2021–2025.
This is not enough data to draw a trend line for either group.

**2. Metric incompatibility.** PHAS (used for NYCHA through 2023) and REAC Multifamily
(used for PACT sites) are different instruments with different weights. PHAS includes
financial and management components; REAC Multifamily is physical only. Even if scores
from the same inspection cycle were plotted side by side, they measure different things.
The system change to NSPIRE in 2024 adds a third incompatible scoring framework. No
cross-walk between PHAS, NSPIRE, and REAC Multifamily is published by HUD.

**3. Match quality.** The three PACT matches are name-only and unconfirmed. The REAC
multifamily file has no address, BBL, or other joinable identifier. "WILLIAMSBURG
APARTMENTS" is a common enough name that the match could be erroneous. Without address
confirmation, the PACT scores cannot be attributed to specific PACT developments with
any confidence.

### 12.4 — Data preserved

The handcrafted data file `data/reac_scores.json` is retained in the repository.
It contains the NYCHA PHA score trajectory and the three approximate PACT matches,
along with methodology notes. It is not fetched or rendered by the page but is
available for future research or if the underlying data gaps are resolved (e.g.,
if HUD publishes a version of the multifamily file with address fields, or if
a future NSPIRE data release covers more PACT properties with enough years of
history to draw a trend).

---

## Step 13 — NYPD Complaint Incident Analysis (PACT vs. Non-PACT)

**Source**: S12 — NYPD Complaint Data (qgea-i56i historical, 5uac-w243 current YTD)  
**Script**: `pact-eviction-analysis/pact_nypd.py`  
**Outputs**: `data/nypd_aggregate.json`, `data/nypd_by_conversion.json`

### 13.1 Motivation

NYPD complaint incident data offers an independent proxy for public safety conditions in
NYCHA developments. Unlike eviction rates (which measure legal process) or rodent
inspections (which measure a single sanitary hazard), NYPD complaint data captures a
broader range of quality-of-life and safety conditions as perceived by residents. The
dataset records all complaint incidents — felony, misdemeanor, and violation — geocoded
to street address.

The research question: do PACT-converted developments see fewer NYPD complaint incidents
per unit than comparable non-PACT public housing, and does this relationship change after
conversion?

### 13.2 Datasets

Two Socrata datasets are combined to cover 2015–present:

| Dataset ID | Coverage | Geospatial field |
|---|---|---|
| `qgea-i56i` | 2006–(current year − 1) historical | `lat_lon` |
| `5uac-w243` | current calendar year (YTD) | `geocoded_column` |

The geospatial field name differs between datasets; this affects how `within_circle()`
SoQL queries are structured. The year boundary is set dynamically using `date.today().year`
so no annual manual update is required.

### 13.3 Uniform Circle Methodology

Both PACT and non-PACT groups use the same spatial strategy: one **150m radius circle
per building**, queried via `within_circle()` SoQL against both NYPD datasets. No
`prem_typ_desc` filter is applied — the geometry defines scope. Incidents are
deduplicated by `cmplnt_num` within each development to prevent double-counting near
overlapping circles.

**Why no premise-type filter:** NYPD may reclassify converted buildings from
`RESIDENCE - PUBLIC HOUSING` to `RESIDENCE - APT. HOUSE` after PACT transfer. A
premise-type filter would make the PACT and non-PACT counts structurally incomparable
(different field values map to the same physical buildings depending on management era).
Uniform circle queries treat both groups identically; the 150m radius captures incidents
at and immediately around each residential building including the sidewalk.

**Why 150m:** Smaller than a typical NYC block face (~200m); large enough to capture
incidents reported at the building address or the curb. Insensitive to minor geocoding
drift in the NYPD dataset.

**Phase 0a — PACT spatial index:**  
PACT building locations are resolved from PLUTO (S4) by BBL. Each development may have
multiple BBLs; coordinates are fetched for all of them.

For compact developments where all parcels are within 500m of each other, a single centroid
circle is used with radius = max-parcel-spread + 100m buffer, floored at 150m. For
scattered developments exceeding 500m spread, the script switches to **per-parcel mode**:
one 150m circle per unique BBL location. Two developments triggered per-parcel mode:
LINDEN (15 circles, 5,070m spread) and BUSHWICK II GROUPS A & C (9 circles, 1,801m spread).

PLUTO returns BBL values as float strings (e.g., `'4160010002.00000000'`); normalized
before lookup: `str(int(float(bbl)))`.

**Phase 0b — Non-PACT spatial index:**  
Non-PACT building locations come from the NYCHA Residential Addresses dataset (S2,
`3ub5-4ph8`), which has one row per building with `latitude`, `longitude`, and
`development` name. All ~2,955 buildings are fetched; those whose `borough_block_lot`
matches a PACT BBL are excluded. The remaining buildings are grouped by `development`
(~216 non-PACT developments); each group gets one 150m circle per building using the
same per-parcel logic as Phase 0a.

**Phase A — Non-PACT incidents:**  
For each non-PACT development's circles, issue `within_circle()` queries against both
NYPD datasets for 2015–present. Results are merged and deduplicated. Developments with
any circles that overlap a PACT development's footprint (rare, for adjacent sites) are
not excluded — the PACT BBL exclusion at Phase 0b already prevents double-attribution.

**Phase B — PACT incidents (pre + post conversion):**  
For each PACT development, the same circles are used to query:
- **Pre-conversion:** 5 full years before conversion (e.g., conv 2021 → query 2016–2020)
- **Post-conversion:** conversion date through present

Pre- and post-conversion records are stored separately. The pre-conversion data enables
the before/after trajectory chart; the post-conversion data feeds the annual rate chart.

### 13.4 Incident Type Breakdown

The `law_cat_cd` field in both NYPD datasets classifies each incident as `FELONY`,
`MISDEMEANOR`, or `VIOLATION`. All three values are captured. Aggregate JSONs store
counts and rates nested by type: `{"all": N, "FELONY": N, "MISDEMEANOR": N, "VIOLATION": N}`.
The website chart includes a dropdown to filter by type.

### 13.5 Denominators

The same PACT/non-PACT unit denominators are reused from the eviction analysis (Step 8).
PACT units accumulate as developments convert; non-PACT units decrease correspondingly.
Rates are expressed per 1,000 residential units per year.

### 13.6 Outputs

**Cached CSVs (excluded from git, regenerated by pipeline):**
- `nypd_pact.csv` — post-conversion incidents at PACT developments (cmplnt_num, date, year, type, development_name)
- `nypd_pact_pre.csv` — pre-conversion incidents at PACT developments (same schema; 5-year window before conv_date)
- `nypd_control.csv` — incidents at non-PACT developments (dev, cmplnt_num, date, year, type)

**Published JSON (Phase C — annual aggregate):**
```json
// data/nypd_aggregate.json — one row per calendar year
{"year": 2024, "pact_devs": 21, "pact_units": 12612,
 "pact_n": {"all": 3730, "FELONY": 812, "MISDEMEANOR": 2101, "VIOLATION": 817},
 "pact_rate": {"all": 295.75, "FELONY": 64.38, ...},
 "ctrl_units": 180305,
 "ctrl_n": {"all": 66204, ...}, "ctrl_rate": {"all": 367.18, ...}}
```

**Published JSON (Phase D — anniversary-year conversion buckets):**
```json
// data/nypd_by_conversion.json — one row per bucket; bucket = floor((incident_date − conv_date).days / 365)
// Each bucket represents exactly 365 days. Bucket 0 = first year post-conversion.
// Negative buckets = pre-conversion years. Range: −PRE_CONV_YEARS (−5) to however many
// post-conversion years have data.
{"bucket": -2, "devs": 27, "units": 13686,
 "n": {"all": 8998, "FELONY": 1921, "MISDEMEANOR": 5382, "VIOLATION": 1695},
 "rate": {"all": 618.8, "FELONY": 132.3, ...}}
```

**Published JSON (Phase D2 — cohort calendar-year aggregate):**
```json
// data/nypd_cohort.json — one row per calendar year
// For each year, pools pre-conversion data for PACT-destined devs not yet converted
// and post-conversion data for those already converted. Denominator = units of devs
// with data in that year only.
{"year": 2018, "pact_devs_in_scope": 14, "pact_devs_converted": 4,
 "pact_units": 8200,
 "pact_n": {"all": 5904, "FELONY": ..., ...},
 "pact_rate": {"all": 719.9, ...},
 "ctrl_units": 183000,
 "ctrl_n": {"all": 69500, ...}, "ctrl_rate": {"all": 379.8, ...}}
```

### 13.7 Chart Presentation

**Chart 1 — PACT Cohort vs. Non-PACT (calendar year, Phase D2 data)**

Tracks PACT-destined developments as a cohort from 2015 to present. For years
before a development converted, its pre-conversion incident data is included in the
PACT cohort line; after conversion, its post-conversion data is used. This means the
PACT cohort line begins before any conversions have happened (2015) and ends with
all converted developments contributing post-conversion data.

Non-PACT (dashed gray) is the same annual rate series as in the aggregate chart.
A tooltip on each year shows the PACT/non-PACT ratio and how many developments
had converted vs. how many were in scope. The type dropdown (All / Felony /
Misdemeanor / Violation) applies to both charts simultaneously.

**Chart 2 — Before/After Conversion Bar Chart (anniversary-year buckets, Phase D data)**

Pools incidents across all PACT developments using anniversary-year buckets anchored
to each development's conversion date:

```
bucket = floor((incident_date − conv_date).days / 365)
```

Every bucket therefore represents exactly 365 days of exposure — no partial-year
annualization is required. Bucket 0 = first 365 days post-conversion; bucket −1 = the
365 days immediately preceding conversion; etc. Pre-conversion bars (buckets < 0) are
gray; post-conversion bars are black.

Each bar has a Poisson 95% confidence interval: `±1.96 × √n / units × 1000`.
Later post-conversion buckets have fewer contributing developments (only those
converted longest ago) and correspondingly wider CI bars. The "devs" count in
the tooltip is the number of distinct developments contributing incidents to
that bucket.

Both charts are expandable (click card) and share the incident-type dropdown filter.

---

## Known Limitations and Caveats
