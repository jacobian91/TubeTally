# TubeTally

Track status of anything by numbered row quickly and then be able to share easily. Designed for irrigation tubes for farming
# TubeTally

## Organization integration test

The real two-account organization test is run manually through GitHub Actions and never stores credentials in the repository.

Create the GitHub environment `organization-integration`, then add these environment secrets once:

- `TUBETALLY_E2E_ADMIN_EMAIL`
- `TUBETALLY_E2E_ADMIN_PASSWORD`
- `TUBETALLY_E2E_MEMBER_EMAIL`
- `TUBETALLY_E2E_MEMBER_PASSWORD`

Run **Organization integration** from the Actions tab with the desired deploy-preview URL. It creates or reuses `TubeTally Integration Test`, then verifies invite, accept, admin promotion, demotion, and removal.
