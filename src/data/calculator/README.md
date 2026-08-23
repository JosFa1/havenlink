# Financial Calculator reference data

Everything the calculator computes with lives in this folder. **No dollar figure is
ever hardcoded in application code.** These five files are the only source, they are
loaded into Postgres by `src/db/seedCalculator.ts`, and adding a state requires no
code change at all.

| File | Table | What it holds |
|---|---|---|
| `cost_profiles.json` | `calc_cost_profiles` | Cost line items per state + adoption type |
| `subsidy_rules.json` | `calc_subsidy_rules` | Subsidies, reimbursements, Medicaid, tuition waivers |
| `tax_constants.json` | `calc_tax_constants` | Federal credit, phase-out, brackets, standard deduction |
| `fpl.json` | `calc_fpl` | HHS poverty guidelines |
| `meta.json` | `calc_data_meta` | The version string that gates the seed |

---

## The rules

**1. Every row carries a real `source_url` and an `effective_year.**
The "show me the math" drawer links families straight to the government page each
figure came from. A row without a working source is a row a family cannot check.
The seeder refuses to load rows with a missing `source_url`.

**2. Pull every figure from a primary source.**
State DCF/DHS fee schedules, state statutes, IRS revenue procedures, HHS, USCIS,
the Children's Bureau. **Not from a blog, not from an adoption agency's marketing
page, not from an older copy of this file, and not from an AI.** Tax figures change
every year and state fee schedules change without notice.

**3. If you cannot source it, do not add it.**
A missing line item falls back to the national range and the family sees an honest
"we don't have your state's data yet" banner. A guessed line item shows a family a
confident number that is wrong. The first failure mode is fine; the second is not.

**4. Money is integer cents.** `$2,500` is `250000`. Never a decimal.

**5. Bump `meta.json`.** The seeder compares that version against what is already
loaded and **no-ops when they match** — if you edit data and forget the version, your
change silently does not deploy.

---

## Adding a state

### Step 1 — cost line items

Open `cost_profiles.json` and copy the `"FL"` block. Change `state_code` to your
two-letter code and work through the line items:

```json
{ "state_code": "GA", "adoption_type": "foster_care", "line_item": "home_study",
  "label": "Home study",
  "low_cents": 0, "high_cents": 0, "effective_year": 2026, "sort_order": 10,
  "source_url": "https://dfcs.georgia.gov/..." }
```

The standard line items, in the order they should be sorted:

| `line_item` | `sort_order` | Where to look |
|---|---|---|
| `home_study` | 10 | State DCF/DHS adoption pages, licensed agency fee schedules |
| `agency_program_fee` | 20 | State agency fee schedule |
| `attorney_fees` | 30 | State bar guidance, agency disclosures |
| `court_filing` | 40 | State statute on circuit/family court filing fees |
| `birth_parent_expenses` | 50 | **State-capped, and $0 in some states** — check the statute |
| `post_placement_visits` | 60 | State post-placement supervision requirements |
| `icpc` | 70 | Only for interstate placements |
| `travel` | 80 | |

International adds `uscis_i800a`, `uscis_i800`, `uscis_biometrics`, `visa`,
`document_authentication`, `in_country_fees`, `second_trip`.

> **Resolution is all-or-nothing per (state, adoption type).** If Georgia has *any*
> `foster_care` rows, only Georgia's rows are used for foster care — national rows are
> not mixed in. A partial state profile therefore *understates* the gross cost. Either
> seed a complete profile for that adoption type, or seed none of it and let the
> national fallback do its job.
>
> Different adoption types are independent: Florida has foster-care rows and falls back
> to national for everything else. That is correct and intended.

### Step 2 — subsidy programs

Open `subsidy_rules.json`. Programs resolve **per `program_key`**, and a state row
*replaces* the `"US"` row with the same key:

| `program_key` | `program_type` | Notes |
|---|---|---|
| `nonrecurring_reimbursement` | `one_time` | Federal ceiling is $2,000; states set their own rate up to it. Florida's is $1,000, so the FL row overrides the US row. |
| `monthly_subsidy` | `monthly` | Set `amount_low_cents`/`amount_high_cents` **per month**. Use `null` for both if the state negotiates per child. |
| `medicaid` | `medical` | Amounts are `null`; presence is the point. |
| `tuition_waiver` | `tuition` | Amounts are `null`. |
| `military_reimbursement` | `one_time` | Federal (DoD). Do not add a state version. |

`eligibility_json` gates the program: `{"special_needs": true}` or `{"military": true}`.
An empty `{}` means it always applies.

Note the units trap: a $5,000/year subsidy is stored as **`41667` cents per month**,
not `500000`. The whole ongoing block is monthly.

### Step 3 — a state tax credit

If the state has its own adoption credit, add it under `state_credit_rules_json` for
the relevant tax year in `tax_constants.json`:

```json
"state_credit_rules_json": {
  "GA": { "name": "Georgia adoption tax credit", "type": "flat_max",
          "value": 600000, "source_url": "https://dor.georgia.gov/..." }
}
```

`type` is `"flat_max"` (a ceiling in cents) or `"percent_of_federal"` (`value` is a
fraction, e.g. `0.25`).

### Step 4 — ship it

1. Bump `version` in `meta.json` (any new string; the date-plus-counter convention
   here is just a convention).
2. `npm run seed` — the seeder validates every row and refuses to load bad data.
3. `npm test` — the fixtures run against this committed data, so a broken edit fails
   there.
4. Run the calculator for that state and confirm the fallback banner is gone.

---

## Updating for a new tax year

Once a year, when the IRS publishes the inflation adjustments (a revenue procedure,
usually in the autumn for the following year):

1. Add a new object to `tax_constants.json` with the new `tax_year`. **Do not edit the
   old one** — a family who saved an estimate under the old figures should still be
   able to read it.
2. Update `federal_credit_max_cents`, `refundable_cap_cents`, `phaseout_start_cents`,
   `phaseout_end_cents`, and the whole `liability_json` (standard deductions and every
   bracket, for all four filing statuses).
3. Add the new year's HHS poverty guidelines to `fpl.json`.
4. Bump `meta.json` and re-run the seed.

The loaders always pick the newest row at or below the requested year, so old rows
coexist harmlessly and mixed vintages are fine — a 2022 Children's Bureau cost figure
sits happily beside a 2026 USCIS fee.

---

## What is seeded today

**Federal / national** — complete.

- Tax year 2026: credit max $17,670, refundable $5,120, phase-out $265,080–$305,080,
  plus standard deductions and full rate schedules for all four filing statuses
  (IRS Rev. Proc. 2025-32).
- 2026 poverty guidelines, household sizes 1–12 (HHS ASPE).
- National cost ranges for all five adoption types (Children's Bureau, June 2022) and
  USCIS adoption filing fees (Form G-1055, edition 05/29/26).

**Florida** — foster care, end to end. Home study and agency fee $0, court filing
capped at the statutory $395, the $5,000/year maintenance subsidy, the $1,000
nonrecurring reimbursement, Medicaid, and the postsecondary tuition exemption.

**Every other state** — falls back to the national ranges with the banner.

> Nothing here has been through a second pair of human eyes. Before this is relied on
> in production, someone should open every `source_url` in these files and confirm the
> figure still matches the page. See `docs/CALCULATOR_DATA.md`.
