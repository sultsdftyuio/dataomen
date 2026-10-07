/**
 * Facts shared by the Terms of Service, Privacy Policy, and Cookie Policy.
 *
 * They live in one place so the three documents cannot drift apart. Changing
 * a value here changes a published legal commitment: update the "last
 * updated" date with it, and make sure the product actually behaves that way.
 */

export const LEGAL_CONTACT_EMAIL = "support@arcli.tech";

// Shown as the "last updated" date on all three documents.
export const LEGAL_UPDATED_ON = "October 7, 2026";

// Arcli is operated by an individual sole proprietor. Set this to the legal
// name to print it in the documents; while it is null they describe the
// operator generically and offer the details on request.
export const LEGAL_OPERATOR_NAME: string | null = null;

export const LEGAL_GOVERNING_LAW =
  "the laws of the Emirate of Ras Al Khaimah and the federal laws of the United Arab Emirates that apply there";
export const LEGAL_COURTS = "the courts of Ras Al Khaimah, United Arab Emirates";

// Retention periods. The first two mirror worker configuration in
// .do/app.yaml (ARCLI_PUBLIC_DATA_RETENTION_DAYS and
// ARCLI_PRIVACY_REQUEST_RETENTION_DAYS); keep them equal.
export const PUBLIC_SOURCE_RETENTION_DAYS = 30;
export const REMOVAL_REQUEST_RETENTION_DAYS = 90;
export const RESULT_EMAIL_RECORD_RETENTION_DAYS = 90;
export const PILOT_APPLICATION_RETENTION_DAYS = 180;

// Notice and response commitments made in the documents.
export const PRICE_CHANGE_NOTICE_DAYS = 30;
export const TERMS_CHANGE_NOTICE_DAYS = 14;
export const ACCOUNT_DELETION_DAYS = 30;
export const LIABILITY_CAP_FLOOR_USD = 100;

export function operatorDescription(): string {
  return LEGAL_OPERATOR_NAME
    ? `${LEGAL_OPERATOR_NAME}, an individual sole proprietor`
    : "an individual sole proprietor";
}
