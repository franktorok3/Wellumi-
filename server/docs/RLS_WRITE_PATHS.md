# Wellumi RLS and Write Paths

This document describes intentional read/write paths for user-owned tables. Service-role server endpoints bypass RLS; client writes are limited to safe surfaces.

## profiles

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT own | Yes | Yes |
| INSERT own | Yes (bootstrap) | Yes |
| UPDATE own | Yes (`display_name`, `last_seen_at`) | Yes (onboarding, account type) |
| DELETE | No | Account deletion only |

## user_preferences

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT own | Yes | Yes |
| INSERT/UPDATE own | Yes (006 policy) | Preferred path: `PUT /preferences`, onboarding endpoints |
| DELETE | No | Account deletion, guest migration RPC |

Preference writes should go through authenticated server endpoints so validation and signal derivation stay consistent.

## user_interest_signals

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT own | Yes | Yes |
| INSERT/UPDATE/DELETE | **No client writes** | Server-only via `interestSignalService` |

## user_story_feedback

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT own | Yes | Yes |
| INSERT own | Yes (006 policy) | Preferred path: `POST /stories/:id/feedback` |
| UPDATE/DELETE | No | Account deletion, migration RPC |

## user_story_matches

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT own | Yes | Yes |
| UPDATE own (`is_read`, `is_dismissed`) | Yes | Yes via feed endpoints |
| INSERT/DELETE | No | Feed workflow, migration RPC |

## scans / analyses

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT/INSERT/UPDATE/DELETE own | Yes | Scan workflow uses service role |
| Cross-user access | **Denied** | Denied except migration RPC |

## saved_products

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT/INSERT/DELETE own | Yes | `POST /saved-products` |
| Cross-user access | **Denied** | Migration RPC only |

## product_interest_profiles

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT own | Yes | Yes |
| INSERT/UPDATE | No | Feed/scan workflows, migration RPC |

## user_feed_refresh

| Operation | Client (RLS) | Server (service role) |
|-----------|--------------|----------------------|
| SELECT own | Yes | Yes |
| INSERT/UPDATE | No | Feed refresh workflow, migration RPC |

## guest_migration_tokens

| Operation | Client | Server |
|-----------|--------|--------|
| All | **Denied** | `POST /account/migration-token`, migration RPC |

## Shared catalog tables

`products`, `wellness_stories`, `source_records`, and join tables are readable by authenticated users. Writes are service-role only.

## Verification

Run `npm run verify:guest-upgrade` and `npm run verify:rls` in `server/` to validate migration RPC structure and documented write paths.
