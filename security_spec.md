# Security Specification for A Big Engine

This specification outlines the data invariants, threat model payloads ("The Dirty Dozen"), and the security rule implementation designed to harden the Firestore database against exploit vectors.

## 1. Data Invariants

1. **User Identity Invariant**: A user's profile under `/users/{username}` can only be created or modified by the user with the corresponding `username` mapping to their authentication UID, or an authorized Admin.
2. **Submission Integrity**: Service orders (`/submissions/{submissionId}`) cannot have their financial totals or status modified by arbitrary unauthenticated users. The `grandTotal` must be a positive number, and status transitions must follow the valid enum sequence.
3. **Admin Exclusivity**: Global settings (`/settings/global`) and catalog entities (e.g. `predefinedServices`, `deliveryHubs`, `productRules`) are read-only for general clients and fully modifiable only by admins.
4. **Data Ownership**: Customer lists (`/customers/{id}`) and audit logs can only be created by authenticated and verified staff/agents.

## 2. The Dirty Dozen Threat Payloads (Targeting PERMISSION_DENIED)

1. **Identity Spoofing**: Attempt to write a profile under `/users/alice` with `request.auth.uid = "attacker_uid"`.
2. **Privilege Escalation**: Attempt to self-assign the `role: "admin"` in a standard user profile creation.
3. **Unauthenticated Order Creation**: Attempt to write to `/submissions/sub-123` with no `request.auth` context.
4. **Unauthenticated Order Deletion**: Attempt to delete order `/submissions/sub-123` with no `request.auth` context.
5. **Setting Poisoning**: Attempt to change the Google Sheets sync URL under `/settings/global` as a non-admin.
6. **Negative Pricing Injection**: Attempt to write a `grandTotal: -1500.00` to a service order under `/submissions/sub-123` to exploit financial logic.
7. **Junk ID Poisoning**: Attempt to create `/submissions/very-long-garbage-string-designed-to-bloat-the-database` where the document ID exceeds 128 characters.
8. **Malicious Catalog Override**: Attempt to edit `predefinedServices/tyre_replacement` convenience fees or pricing as a general user.
9. **Fake Customer Seeding**: Attempt to insert a customer profile under `/customers/cust-999` with negative latitude/longitude coordinates beyond geographic limits.
10. **Shadow Field Injection**: Attempt to write a submission with an unmodeled `ghostField: "hacker_payload"` bypass.
11. **Spoofed Admin Role Claim**: Attempt to read `/settings/global` claiming administrative role by spoofing the token payload.
12. **Status Shortcutting**: Attempt to transition an active order status directly from "Draft" to "Completed" without proper step logging.

## 3. Security Rules draft (`DRAFT_firestore.rules`)

These constraints have been translated into the `DRAFT_firestore.rules` below.
