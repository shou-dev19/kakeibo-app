# ISO Date Normalization Design

## Goal

Allow the securities balance form to submit the native HTML date input format,
`YYYY-MM-DD`, without weakening date validation or changing the behavior of the
existing supported formats.

## Scope

- Extend the shared `normalizeDate()` function to accept exactly zero-padded
  `YYYY-MM-DD`.
- Continue accepting `YYYY/MM/DD`, `YYYY/M/D`, and six-digit `YYMMDD`.
- Continue rejecting empty values, malformed strings, and nonexistent calendar
  dates.
- Add unit and route-level regression coverage.

No client-side form, database schema, or stored-date format changes are needed.

## Design

Add an ISO-date branch to `normalizeDate()` before the existing slash and
six-digit branches. The branch will match `^\d{4}-\d{2}-\d{2}$`, extract the
year, month, and day, and pass them to the existing `buildIsoDate()` helper.

Using `buildIsoDate()` keeps calendar validation in one place, so values such as
`2025-02-30` remain invalid. The strict regular expression ensures variants such
as `2025-7-2` are not accepted.

The normalized result remains an ISO `YYYY-MM-DD` string. Therefore, the data
flow remains:

1. The browser date input submits `YYYY-MM-DD`.
2. The securities API calls `normalizeDate()`.
3. The normalized date is validated and stored in the existing D1 text column.

## Error Handling

Invalid ISO dates continue to produce `null` from `normalizeDate()`. The
securities API will preserve its existing `400` response with
`{ "error": "invalid date" }`.

## Tests

Update the date utility tests to cover:

- acceptance of `2025-07-12`;
- rejection of nonexistent ISO dates such as `2025-02-30`;
- rejection of non-zero-padded forms such as `2025-7-2`;
- preservation of the existing slash and six-digit format behavior.

Add a securities route regression test that submits an ISO date and verifies a
`201` response. This covers the exact format emitted by the report screen's
native date input.
