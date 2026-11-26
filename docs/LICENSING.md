# SANA License integration

The IDE must integrate with the existing SANA License API using one explicitly versioned contract.

Required client behavior:
- Validate activation and device binding with the license service.
- Verify signed server responses with the public verification key.
- Handle revoked, expired, invalid and temporarily unreachable states distinctly.
- Cache only the minimum signed entitlement data required for a bounded offline grace period, if the server contract explicitly supports one.
- Protect local state with OS facilities where appropriate; do not claim software storage is hardware-backed.
- Never embed administrator credentials, database connection strings, or private signing keys in the IDE.

Before implementation, pin the API base URL and contract version and add integration tests against the actual server contract. Do not mix incompatible protocol versions or invent endpoint names.
