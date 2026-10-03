# Platform, upgrade and integration (Odoo 16-20)

Citation form: [branch file path (section/symbol)]. Paths are in github.com/odoo/documentation unless marked "source" (odoo/odoo). Doc path prefix `content/` is kept. Where a page is identical across branches, the entry says so.

## Summary (Odoo 19/20)

1. Upgrade scripts live in `<module>/migrations/<version>/{pre,post,end}-*.py` (or `upgrades/`) and expose `migrate(cr, version)`. They run only for modules being upgraded.
2. `pre` runs before the schema update and data load, `post` after the module data loads, `end` after all modules load.
3. Standard modules are migrated by Odoo's upgrade platform (upgrade.odoo.com). Custom modules are the customer's job and must exist for the target version first.
4. A test upgrade yields a neutralized database. The production upgrade needs a separate run and the filestore must be merged.
5. The external API is now JSON-2: `POST /json/2/<model>/<method>` with a bearer API key. XML-RPC and `/jsonrpc` are deprecated since 19 and scheduled for removal in Odoo 22. The `db` service is gone in 20.
6. Every RPC call is checked against ACLs, record rules and field groups of the calling user. Methods starting with `_` or marked `@api.private` cannot be called.
7. Production deployment uses `--workers` N, a reverse proxy with `--proxy-mode`, and `/websocket/` routed to the gevent port 8072.
8. Backups: `odoo-bin db dump` (zip with filestore by default), the database manager (protected by `admin_passwd`), or the platform's own backups on Online and Odoo.sh.
9. Profiling uses `ir.profile` records and speedscope. It is not available on Odoo Online.
10. Online allows no custom code. Odoo.sh runs custom code with branches, builds and rollback. On-premise gives full control and full responsibility.

Docs caveat: the `content/administration/*` pages are identical in 17.0 to 20.0 (checked by diff). Per-version rows for them say so, and per-version facts come from source.

---

## 1. Upgrade scripts (pre / post / end, version rule)

### What it is
Python files in a module's `migrations/` (or `upgrades/`) folder that fix data and schema when a module moves to a higher version. They run during a module update, not at install.

### How it works
1. Layout: `$module/migrations/$version/{pre,post,end}-*.py`; `migrate(cr, version)` [20.0 content/developer/reference/upgrades/upgrade_scripts.rst]. `upgrades/` is also valid [source 19.0 odoo/modules/migration.py (MigrationManager)].
2. Phase `pre`: before the module is loaded. Phase `post`: after the module and its dependencies are loaded and updated. Phase `end`: after all modules are loaded for that version. Order is lexical within a phase [20.0 upgrade_scripts.rst].
3. Docs rule: the `$version` directory must be above the installed version and at most the updated version [20.0 upgrade_scripts.rst].
4. Source rule: `installed < full_version <= current`. A folder without the Odoo prefix (`2.0`) gets `release.major_version` prefixed and only the module part is compared. Folder `0.0.0` runs on any version change: first in `pre`, last in `post` and `end`. Folder `tests` is ignored. Scripts from `--upgrade-path` are merged in [source 19.0 odoo/modules/migration.py (MigrationManager.migrate_module, compare, VERSION_RE)].
5. Only modules in state "to upgrade" (or in `Registry._force_upgrade_scripts`) run scripts; a fresh install runs none [source 19.0 migration.py].
6. In the loader, `pre` runs before `registry.load` (so before `init_models` and data XML), `post` after `load_data`, `end` in "STEP 3.5" after all modules [source 19.0 odoo/modules/loading.py]. `--pre-upgrade-scripts` runs against `base` before the base graph loads [source 19.0 loading.py].

| Phase | Schema updated? | Module data XML loaded? | Typical use |
|---|---|---|---|
| pre | no | no | rename columns/models, drop constraints |
| post | yes | yes | recompute, fix data |
| end | yes | yes, all modules | cross-module cleanup |

(Typical-use column is my reading of the rows above, not a docs statement. Schema and data columns: [source 19.0 odoo/modules/loading.py; 20.0 upgrade_scripts.rst].)

### Where it breaks
- Version folder not strictly above the installed version: script silently never runs.
- Bump of the manifest version missing: module is not "to upgrade" by version, so scripts do not run unless forced.
- Script without a valid `migrate`: 16 logs an error and continues; 18+ raises [source 16.0 and 18.0 migration.py].
- Docs say `pre` runs "before the module is loaded"; source shows it also runs before the model schema update. Do not assume new columns exist.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | No folder validation; script without `migrate` only logs an error | [source 16.0 odoo/modules/migration.py] |
| 17 | `VERSION_RE` validation (bad folders skipped with a warning); `tests` ignored | [source 17.0 migration.py] |
| 18 | Signature check: `migrate` must be `(cr, version)` or `(_cr, _version)`; missing/bad `migrate` raises | [source 18.0 migration.py] |
| 19 | No change from 18 | [source 19.0 migration.py] |
| 20 | Per-stage timing logs, `logging.RUNBOT` when a stage takes over 20 s | [source 20.0 migration.py] |
| Docs | upgrade_scripts.rst identical in 16-20 | [16.0-20.0 content/developer/reference/upgrades/upgrade_scripts.rst] |

### How to check
Run `odoo-bin -d <db> -u <module> --log-level=info` and read the log for lines naming each `pre-`/`post-`/`end-` script. (Log wording not verified.)

### Question seeds
1. Scenario: Module is installed at 17.0.1.0, manifest now says 17.0.1.2. A script sits in `migrations/17.0.1.2.0/`. Answer: it runs only if the folder version is > installed and <= new; check the folder naming against the manifest version format. Tempting wrong: it always runs on `-u`. Why it fails: the folder must satisfy `installed < folder <= current`.
2. Scenario: You need to rename a column so the ORM does not create a new empty one. Which phase? Answer: `pre`, before `init_models` updates the schema. Tempting wrong: `post`. Why it fails: by then the ORM already added the new column and the old data is orphaned.
3. Scenario: A cleanup needs records from a module that loads after yours. Answer: an `end-` script, which runs after all modules load. Tempting wrong: `post-` in your module. Why it fails: `post` runs after your module and its dependencies only.
4. Scenario: A developer installs the module on an empty database and expects the migration to prepare data. Answer: nothing runs, scripts run only on upgrade. Tempting wrong: `pre` always runs once. Why it fails: only modules in "to upgrade" state run scripts.

---

## 2. Upgrade utils and upgrading a custom database

### What it is
`odoo/upgrade-util` is the helper library used inside migration scripts. The custom-DB howto is the procedure for making your own modules survive an Odoo-driven upgrade.

### How it works
1. Install: `--upgrade-path=/path/src`, or `pip install git+https://github.com/odoo/upgrade-util@master`, or on Odoo.sh `odoo_upgrade @ git+https://github.com/odoo/upgrade-util@master` in `requirements.txt`. Import `from odoo.upgrade import util` [20.0 content/developer/reference/upgrades/upgrade_utils.rst; identical 16-20].
2. Helpers named in the docs include `rename_field`, `rename_model`, `rename_xmlid`, `recompute_fields`, `remove_module`, `update_record_from_xml`; test base classes in `odoo.upgrade.testing` [same file].
3. Procedure [20.0 content/developer/howtos/upgrade_custom_db.rst]:
   1. Freeze developments.
   2. Request an upgraded test database.
   3. Make modules installable on an empty database of the target version.
   4. Make them work on the upgraded database.
   5. Test and rehearse.
   6. Upgrade production.
4. Views that break during the upgrade are disabled; see the upgrade report. `noupdate` data is not touched by the module update [same file].
5. Where to run: Online cannot (no custom Python). Odoo.sh "update on commit" restores the upgraded backup and updates custom modules on each push to the staging branch. On-premise: restore the dump and run `-u <modules>` [same file].
6. Studio customizations are not "custom modules" for this purpose [same file].

### Where it breaks
- Fixing the module only on an empty database: it installs but fails on migrated data (step 4 skipped).
- `noupdate` records keep old values and need an explicit script.
- Upgrade-util not importable on Odoo.sh because it was not added to `requirements.txt`.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Procedure and util docs present | [16.0 content/developer/howtos/upgrade_custom_db.rst] |
| 17 | Typo-level changes only | [17.0 same file] |
| 18 | No change found | [18.0 same file] |
| 19 | No change found | [19.0 same file] |
| 20 | No change found | [20.0 same file] |

### How to check
`python -c "from odoo.upgrade import util; print(util.__file__)"` with the Odoo environment active shows whether the library is on the path.

### Question seeds
1. Scenario: A model is renamed between versions and the data must follow. Answer: call `util.rename_model` in a `pre` script. Tempting wrong: change `_name` and let the ORM migrate. Why it fails: the ORM creates a new table and orphans old rows.
2. Scenario: A customer on Odoo Online has a custom module and wants a migration script. Answer: impossible; Online allows no custom Python. Tempting wrong: upload via Apps. Why it fails: custom modules cannot run on Online.
3. Scenario: On Odoo.sh, you push a fix to staging after an upgrade test. Answer: "update on commit" restores the upgraded backup and updates custom modules. Tempting wrong: staging keeps the previous DB. Why it fails: each push repeats the restore plus update.
4. Scenario: A Studio-only database is upgraded. Answer: it is covered by the SLA if Studio stays installed and the subscription is active. Tempting wrong: treat it as a custom module needing your own scripts. Why it fails: Studio customizations are not custom modules here.

---

## 3. Core vs custom migration, the upgrade platform and support windows

### What it is
Odoo upgrades standard apps itself on upgrade.odoo.com. Custom modules are outside that and must be ported by their owner.

### How it works
1. Command: `python <(curl -s https://upgrade.odoo.com/upgrade) test -d <db> -t <target>`; use `production` for the real run. Needs TCP 443 and a port in 32768-60999 [20.0 content/administration/upgrade.rst; same 17-20].
2. Test databases are neutralized (see Section 7). The upgraded dump has no production filestore; merge it with the production one [same file].
3. A database with custom modules cannot be upgraded until a target-version version of them exists [same file].
4. SLA covers standard apps, Studio customizations (Studio installed, active subscription), and customizations under maintenance. Not covered: data cleaning, in-house or third-party modules without maintenance, training [same file].
5. Online: a major version needs an upgrade every 2 years; a SaaS version a few weeks after the next release. A silent test upgrade runs before an automatic upgrade at the deadline [same file].
6. Odoo.sh: after 3 years of support there are 2 more years to upgrade. The production upgrade is triggered by a commit and auto-reverts on failure [same file].
7. The upgrade platform's own scripts for standard modules: not found in the documentation or odoo/odoo.

| Version | Release | Standard support to | Citation |
|---|---|---|---|
| 16.0 | Oct 2022 | Sep 2025 | [20.0 content/administration/standard_extended_support.rst] |
| 17.0 | Nov 2023 | Sep 2026 (Odoo.sh and on-premise extended; Online no) | same |
| 18.0 | Oct 2024 | Sep 2027 | same |
| 19.0 | Sep 2025 | Sep 2028 | same |
| 20.0 | Sep 2026 | Sep 2029 (planned) | same |

Upgrade is possible from any version to any major version in standard support or ended less than 6 months ago [same file].

### Where it breaks
- Custom module not ported: upgrade is blocked.
- Testing only the test upgrade: production still needs its own run and filestore merge.
- Docs pages are rolling: the 17.0 and 18.0 pages already list 20.0.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Different Online UI path (arrow icon, not Manage > Upgrade); links `supported_versions.rst` | [16.0 content/administration/upgrade.rst] |
| 17 | File renamed to `standard_extended_support.rst`; UI path Manage > Upgrade | [17.0 content/administration/upgrade.rst] |
| 18 | No change found | [18.0 same] |
| 19 | No change found | [19.0 same] |
| 20 | No change found | [20.0 same] |

### How to check
Run the `test` command against a copy of the database and read the generated upgrade report. On Odoo.sh use the branch's Upgrade tab and `~/logs/upgrade.log`.

### Question seeds
1. Scenario: Test upgrade succeeded. The team restores the dump as production. Answer: wrong; test DBs are neutralized and have no production filestore. Tempting wrong: it is a valid production copy. Why it fails: the neutralized state disables mail and crons; the filestore must be merged.
2. Scenario: A DB with an unmaintained third-party module is requested for upgrade. Answer: it cannot be upgraded until a target-version of the module exists, and it is outside SLA. Tempting wrong: the platform skips it. Why it fails: custom modules block the upgrade.
3. Scenario: An Online customer on 17.0 asks for extended support. Answer: not available on Online. Tempting wrong: extended support applies to every hosting. Why it fails: the table limits it to Odoo.sh and on-premise.
4. Scenario: A production DB is on 16.0 in early 2027. Answer: it ended Sep 2025; upgrade is possible only if it ended under 6 months ago, so check eligibility. Tempting wrong: any version can always upgrade. Why it fails: the 6-month window.

---

## 4. External API: XML-RPC, JSON-RPC and JSON-2

### What it is
Three generations of remote access to models. XML-RPC/JSON-RPC (`common`, `db`, `object` services) are deprecated; JSON-2 is the replacement.

### How it works
1. Legacy (16-18): `xmlrpc/2/common` (`version()`, `authenticate(db, user, password, {})`) and `xmlrpc/2/object` (`execute_kw`) [16.0, 17.0, 18.0 content/developer/reference/external_api.rst].
2. Legacy dispatch: `execute_kw` runs `execute_cr` under `retrying` (up to 5 tries on serialization errors) and `call_kw`; names starting with `_`, unsafe attributes, and `@api.private` methods are refused [source 19.0 odoo/service/model.py (get_public_method, call_kw, retrying)].
3. 19: new doc "External JSON-2 API" (`versionadded:: 19.0`); the old doc moves to `external_rpc_api.rst` with a `deprecated:: 19.0` box. All three services of `/xmlrpc`, `/xmlrpc/2`, `/jsonrpc` are scheduled for removal in Odoo 22 (fall 2028) and Online 21.1 (winter 2027) [19.0 content/developer/reference/external_api.rst, external_rpc_api.rst].
4. 20: the `db` service is removed (Odoo 20, fall 2026; Online 19.1). `common` and `object` stay until Odoo 22 [20.0 external_api.rst, "Migrating from XML-RPC / JSON-RPC"].
5. JSON-2 call: `POST /json/2/<model>/<method>`; headers `Authorization: bearer <key>` (required), `Content-Type: application/json`, `X-Odoo-Database` (only with multiple DBs when dbfilter cannot use Host), `User-Agent` recommended. Body: `ids`, `context`, plus named parameters; no positional arguments [19.0 and 20.0 external_api.rst].
6. Responses: 200 with JSON; errors 4xx/5xx with `{name, message, arguments, context, debug}`. Each call is its own transaction [same].
7. Source: route `/json/2/<__model__>/<__method__>`, POST only, `auth='bearer'`, `type='json2'`, `save_session=False`; `readonly` follows `_readonly` (`@api.readonly`); unknown model/method 404; `ids` on an `@api.model` method or bad signature 422; recordset results become ids [source 19.0 and 20.0 addons/rpc/controllers/json2.py]. 20 adds `bearer_scope='rpc'` [source 20.0 json2.py].
8. Deprecation is logged: `RPC_DEPRECATION_NOTICE` warns on each legacy call and can be muted with `--log-handler <logger>:ERROR` [source 19.0 and 20.0 addons/rpc/controllers/__init__.py].
9. Replacements: `/web/version` for `common.version()`; `db` functions map to `/web/database/*` controllers; `list_lang`/`list_countries` to JSON-2 on `res.lang`/`res.country`; `migrate_databases` has no replacement [20.0 external_api.rst]. Controllers with `type='jsonrpc'` (named `json` up to 18) are not affected [same].
10. External API access is only on the Custom pricing plan [18.0, 19.0, 20.0 external_api.rst].

### Where it breaks
- Chaining several JSON-2 calls expecting one transaction: each call commits alone. Use one server method (e.g. `action_confirm`) [19.0 external_api.rst].
- Positional args in JSON-2: not supported.
- `ids` sent to an `@api.model` method: 422.
- Scripts that call `db` service on 20: removed.
- Wrong `X-Odoo-Database` with several DBs.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | XML-RPC only documented; no deprecation text | [16.0 external_api.rst] |
| 17 | Examples use `read ['display_name']` rather than `name_get` | [17.0 external_api.rst] |
| 18 | Example uses `name_search`; no deprecation text found | [18.0 external_api.rst] |
| 19 | JSON-2 added; RPC deprecated, removal in 22; rpc code moves to `addons/rpc` (was `odoo/addons/base/controllers/rpc.py` in 18) | [19.0 external_api.rst; source 18.0 odoo/addons/base/controllers/rpc.py; source 19.0 addons/rpc] |
| 20 | `db` service removed; `bearer_scope='rpc'` (programmatic API keys are already documented in 19.0) | [20.0 external_api.rst; source 20.0 json2.py] [corrected] |

### How to check
`curl -s -X POST https://host/json/2/res.partner/search_read -H "Authorization: bearer $KEY" -H "Content-Type: application/json" -d '{"domain": [], "fields": ["name"], "limit": 1}'` (19+). A warning line in the server log with the deprecation notice shows a legacy client is still in use.

### Question seeds
1. Scenario: A script creates an order then confirms it via two JSON-2 calls and the second fails. Answer: the first stays committed; use `action_confirm` within one call or compensate. Tempting wrong: both calls roll back. Why it fails: each call is its own transaction.
2. Scenario: A Odoo 20 integration drops DBs via `xmlrpc/2/db`. Answer: the service is removed; use `/web/database/drop`. Tempting wrong: it still works until 22. Why it fails: only `common` and `object` wait for 22.
3. Scenario: A client posts `{"args": [[1,2]]}` to JSON-2. Answer: named parameters and `ids` only. Tempting wrong: positional args like `execute_kw`. Why it fails: JSON-2 accepts no positional arguments.
4. Scenario: Your `@route(type='jsonrpc')` controller is flagged by the team as deprecated. Answer: not affected; only `/xmlrpc`, `/xmlrpc/2`, `/jsonrpc` services are. Tempting wrong: every JSON-RPC is going away. Why it fails: controller route types are separate from the service endpoints.

---

## 5. API keys and what access rules do over RPC

### What it is
API keys authenticate RPC callers without passwords. The caller's normal security (ACL, `ir.rule`, field groups) still applies.

### How it works
1. Key replaces the password; login stays the same; shown once [16.0, 17.0, 18.0 external_api.rst, "API Keys"; `versionadded:: 14.0`].
2. Online users have no local password; set one through Change Password before using XML-RPC [16-18 external_api.rst].
3. 19 and 20 docs: a key needs a description and duration; max 3 months; 160 bits. Programmatic management: `res.users.apikeys.generate(key, scope, name, expiration_date)` and `revoke(key)` via JSON-2. Default only the Settings right; others need `base.enable_programmatic_api_keys=True`. Limit 10 per user (`base.programmatic_api_keys_limit`); exceeding returns 422, failed revoke 403 [19.0 and 20.0 external_api.rst; the two pages differ only in the RPC removal paragraph]. [corrected]
4. Source expiry: 18 adds `expiration_date` and `res.groups.api_key_duration`; `_check_expiration_date` allows `max(group.api_key_duration) or 1.0` days; system users are exempt. 90.0 days set on `base.group_user` in 18 and 19 [source 18.0/19.0 odoo/addons/base/models/res_users.py, odoo/addons/base/security/base_groups.xml]. In 20 the 90.0 moves to group `group_user_regular`, `scope` is required, and a non-system user must give an expiration date [source 20.0 res_users.py].
5. Access: all JSON-2 operations are validated against the user's access rights, record rules and field access. Use dedicated bot users with minimal permissions [19.0, 20.0 external_api.rst, "Access Rights"].
6. Rule engine: ACLs (`ir.model.access`) are additive and checked first. `ir.rule` is default-allow: global rules intersect, group rules unify, the two sets intersect. `perm_*` selects operations. Domain variables `time`, `user`, `company_id`, `company_ids`. Field `groups` restricts fields [20.0 content/developer/reference/backend/security.rst].
7. Public methods are reachable by RPC; `_` methods are not. ACLs are checked only in CRUD, so a public method must not trust its arguments [20.0 security.rst; source 19.0 odoo/service/model.py get_public_method].

### Where it breaks
- Key used by an admin account: `sudo`-like reach by user rights, not by the key. A leaked admin key is a leaked admin.
- Key expires silently on schedule (duration by group).
- `sudo()` inside a public method bypasses rules for every remote caller.
- The RPC page does not itself state `ir.rule` applies to XML-RPC; the generic security page and the JSON-2 page do.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Keys without expiration; `scope` plain char; `scope='rpc'` needs a global key (scope NULL) | [source 16.0 odoo/addons/base/models/res_users.py] |
| 17 | Same as 16 | [source 17.0 res_users.py] |
| 18 | `expiration_date`, `api_key_duration` (90 d on `base.group_user`) | [source 18.0 res_users.py, base_groups.xml] |
| 19 | Same; `DEFAULT_PROGRAMMATIC_API_KEYS_LIMIT = 10`, `_ensure_can_manage_keys_programmatically` | [source 19.0 res_users.py] |
| 20 | 90 d moves to `group_user_regular`; `scope` required; expiry mandatory for non-system | [source 20.0 res_users.py] |

### How to check
Preferences > Account Security > New API Key (UI path per docs section "API Keys"). Then call any JSON-2 method as that user and compare the result with what the user sees in the UI.

### Question seeds
1. Scenario: A bot uses an admin's key to read invoices only. Answer: create a dedicated user with minimal groups. Tempting wrong: the key limits scope to reading. Why it fails: the key carries the full rights of its user.
2. Scenario: A record rule hides other companies' partners. An XML-RPC `search_read` is run with that user's key. Answer: the rule still applies. Tempting wrong: RPC bypasses record rules. Why it fails: access checks run in the ORM for the calling uid.
3. Scenario: A public method `def archive_all(self, ids)` uses `sudo().browse(ids).write(...)`. Answer: any RPC caller can use it; checks are skipped. Tempting wrong: ACLs protect it automatically. Why it fails: ACLs are checked only in CRUD under the caller's env.
4. Scenario: An integration key stops working after 90 days in 19. Answer: group `api_key_duration` caps expiry (system users are exempt). Tempting wrong: keys never expire. Why it fails: 18+ added expiration.

---

## 6. Deployment and configuration (workers, limits, websocket, proxy mode)

### What it is
How the Odoo server runs in production: process model, resource limits, reverse proxy and live-chat/bus transport.

### How it works
1. Default is a multithreaded server (`--workers` 0). Multiprocess needs `--workers N` and Unix. A gevent process listens on `--gevent-port` (8072); the proxy sends `/websocket/` to it. Cron workers are extra (`--max-cron-threads`, default 2) [18.0 content/administration/on_premise/deploy.rst "Builtin server"; cli.rst].
2. Sizing: workers = (#CPU*2)+1; 1 worker is about 6 concurrent users; RAM estimate is 20% heavy requests at ~1 GB and 80% light at ~150 MB [deploy.rst].
3. Example: `limit_memory_hard=1677721600`, `limit_memory_soft=629145600`, `limit_request=8192`, `limit_time_cpu=600`, `limit_time_real=1200`, `max_cron_threads=1`, `workers=8` [deploy.rst].
4. Documented defaults [cli.rst 16-20, "Multiprocessing"]: `--limit-request` 8196, `--limit-memory-soft` 2048 MiB (recycled after the request), `--limit-memory-hard` 2560 MiB (killed at once), `--limit-time-cpu` 60, `--limit-time-real` 120, `--limit-time-worker-cron` 0.
5. `--proxy-mode`: uses X-Forwarded-* headers; ignored if X-Forwarded-Host missing; takes the last X-Forwarded-For entry; updates `web.base.url` after admin login; never enable without a reverse proxy [cli.rst].
6. nginx sample: `proxy_read_timeout 720s`, `/websocket` to the 8072 upstream, X-Forwarded-* headers, HSTS, `proxy_cookie_flags session_id samesite=lax secure`. `--x-sendfile` delegates attachments to X-Accel [deploy.rst]. WSGI mode: cron on a separate server with `--no-http` and `--workers=-1`; livechat needs a gevent-compatible server [deploy.rst].
7. DB selection: `--db-filter` (regex, `%h`, `%d`; not applied to cron workers, which run on every DB unless `-d`), `list_db`, `admin_passwd`, PostgreSQL user not a superuser, `--db_sslmode`, `--db-template` (default template0), `--unaccent` [deploy.rst, cli.rst].
8. Read replica: `--db_replica_host`/`--db_replica_port` (18+ source; env `PGHOST_REPLICA`/`PGPORT_REPLICA` in 19/20); `--dev=replica` simulates one; `--dev=access` logs AccessError tracebacks (19/20 docs) [cli.rst 18/19/20; source config.py 18-20].

### Where it breaks
- No proxy route for `/websocket/` to 8072: live chat and bus notifications fail.
- `--proxy-mode` without a proxy: clients can forge their IP via headers.
- Doc default `limit_request` 8196 vs source default `2**16` (see Doubts).
- Cron workers ignore dbfilter, so with many DBs they all run.
- Worker killed at `limit_memory_hard` mid-request: HTTP 500 for the user.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `--longpolling-port` is deprecated alias of `--gevent-port` (default 0); docs already route `/websocket/` | [source 16.0 odoo/tools/config.py; 16.0 deploy.rst] |
| 17 | Same alias; no replica options in source or docs | [source 17.0 config.py; 17.0 cli.rst] [corrected] |
| 18 | `--longpolling-port` removed; replica options exist; `--without-demo` still default False (demo loaded) | [source 18.0 config.py] |
| 19 | `--with-demo` default False (no demo by default); replica default None; `--reinit` and `--shell-file` documented | [source 19.0 config.py; 19.0 cli.rst] [corrected] |
| 20 | `--db-system`, `--log-config` (JSON/TOML), `--syslog` deprecated, populate/blueprint command | [20.0 cli.rst] [corrected] |
| Docs | deploy.rst identical 17-20; 16 vs 17 minor (dbfilter anchors, X-Accel headers) | [17.0-20.0 deploy.rst] |

### How to check
`ps aux | grep odoo` for worker count, and `curl -I https://host/websocket/` (via proxy) should answer 400/426-type upgrade responses rather than 404 (expected result not verified). Check effective values in the config file or `odoo-bin --help`.

### Question seeds
1. Scenario: 4-CPU server, expected 40 concurrent users. Answer: about 9 workers by the rule, 6 users each ~ 54 users capacity; plus cron workers. Tempting wrong: workers = users. Why it fails: workers are sized from CPUs and RAM.
2. Scenario: Live chat works in dev but not behind nginx. Answer: route `/websocket/` to port 8072. Tempting wrong: raise `proxy_read_timeout`. Why it fails: the gevent worker is not reached at all.
3. Scenario: Several DBs on a server and dbfilter is set; crons run on all. Answer: dbfilter does not apply to cron workers; use `-d`. Tempting wrong: dbfilter limits crons. Why it fails: stated explicitly in the docs.
4. Scenario: Report export dies with HTTP 500 on huge data. Answer: memory hard limit hit; raise `--limit-memory-hard` or batch. Tempting wrong: increase `limit_time_real`. Why it fails: the memory limit, not time, kills it.

---

## 7. Database management and backups

### What it is
Tools to dump, restore, duplicate, neutralize and protect databases on every hosting type.

### How it works
1. CLI: `odoo-bin db dump <db> [path] [--format zip|dump] [--no-filestore]` (zip default, includes filestore); `db load <db> <file> [-f] [-n]`; `db duplicate <src> <tgt> [-n] [-f]`; `db rename`; `db drop` [18.0 and 20.0 content/developer/reference/cli.rst].
2. Neutralization: `odoo-bin neutralize -d <db> [--stdout]` runs each installed module's `neutralize.sql`. Disables scheduled actions, outgoing mail, bank sync, payment providers, delivery methods, IAP tokens, website indexing; shows a red banner [content/administration/neutralized_database.rst, cli.rst; identical 16-20].
3. Manager at `/web/database/manager`, protected by `admin_passwd`. For internet-facing systems set `list_db=False` and block `/web/database` at the proxy except `/web/database/selector` [deploy.rst "Database Manager Security"].
4. Odoo.sh: production backed up automatically, 7 daily, 4 weekly, 3 monthly (dump, filestore, logs, sessions); the production server keeps 1 month, dedicated backup servers the monthly. Staging/development: no automatic backups. Manual backups last 3 days, 5 per day, not on development. An `Update` backup runs when a merged commit changes a module version or `requirements.txt` [content/administration/odoo_sh/getting_started/branches.rst; identical 17-20].
5. Online: daily backups per Cloud SLA; Download Backup may be disabled for large DBs; duplicates expire after 15 days, max 5, "For testing purposes" on by default; deletion irreversible [content/administration/odoo_online.rst].
6. Moving between hostings: to Online needs non-standard apps removed, a supported version, a ticket; Online SaaS versions must go to the next major before Odoo.sh/on-premise [content/administration/hosting.rst].
7. On-premise registration: one DB per subscription code; user-count mismatch gives a 30-day countdown; weekly notification must reach services.odoo.com on port 80 (18+; services.openerp.com in 17 and below) [content/administration/on_premise.rst]. "Updating" (bugfix) is not "upgrading" [on_premise/update.rst].

### Where it breaks
- `db dump --format dump` or `--no-filestore`: attachments missing after restore.
- Restoring a production dump onto a test server without `-n`: real mail and payments run.
- Database manager exposed publicly with a weak `admin_passwd`.
- Staging DBs deleted after 1 month; dev DBs after about 3 days [branches.rst].

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | CLI, neutralize, manager present | [16.0 cli.rst, neutralized_database.rst] |
| 17 | Administration pages become the rolling set | [17.0 content/administration/*] |
| 18 | No change found (docs); `services.odoo.com` port 80 | [18.0 on_premise.rst] |
| 19 | `db init` subcommand documented; `/web/database/*` is the replacement for the db service | [19.0 cli.rst; 20.0 external_api.rst] |
| 20 | `odoo/service/db.py` absent from the tree, consistent with the docs claim that the db service was removed | [source 19.0 and 20.0 tree listing] |

### How to check
`odoo-bin db dump <db> /backups/<db>.zip` then `unzip -l` shows `dump.sql`, `filestore/` and `manifest.json` (listing not verified).

### Question seeds
1. Scenario: A staging copy of production sends real customer emails. Answer: it was not neutralized; use `-n` / `neutralize`. Tempting wrong: staging has no outgoing mail. Why it fails: only neutralized or Odoo.sh staging catches mail.
2. Scenario: A dump is taken with `--format dump`. Answer: SQL only, no filestore. Tempting wrong: it is the same as zip. Why it fails: only zip includes the filestore.
3. Scenario: Dev branch DB is wanted next week from a backup. Answer: dev has no automatic backups; build from production. Tempting wrong: Odoo.sh backs up all branches. Why it fails: only production is backed up.
4. Scenario: A manager exposed at `/web/database/manager`. Answer: set `list_db=False`, block the path at the proxy, strong `admin_passwd`. Tempting wrong: dbfilter alone hides it. Why it fails: dbfilter selects DBs, not the manager.

---

## 8. Profiling and performance tools

### What it is
Built-in profiler that stores execution traces as `ir.profile` and shows them in speedscope.

### How it works
1. Enable: debug mode > "Enable profiling" (global, with expiry) or Settings > General Settings > Performance "Enable profiling until"; users toggle it per session [20.0 content/developer/reference/backend/performance.rst].
2. Records are `ir.profile`, grouped per session. From Python: `with Profiler():`, or `self.profile()` in tests; `ExecutionContext(...)` splits calls [same].
3. Collectors: SQL (`sql`, `SqlCollector`), periodic (`traces_async`, `PeriodicCollector`, interval 10 ms default), QWeb (`qweb`). Default is SQL + periodic [same].
4. Odoo.sh Tools tab: profiler records up to 5 minutes and draws a flame graph [branches.rst]. Online cannot be profiled [18.0 performance.rst].
5. Good practice: batch operations, batch `create`, prefetch, lower algorithmic complexity, `_read_group` over `read_group` in 17+ docs, `index=True` carefully [17.0 performance.rst].

### Where it breaks
- Collector overhead skews timings; cache state changes results; large results hit the memory limit (HTTP 500).
- Profiling a cold cache first gives misleading numbers.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Sync collector (`traces_sync`) documented; populate section with `--size` | [16.0 performance.rst, cli.rst] |
| 17 | `_read_group` example; populate described with `--factors` | [17.0 performance.rst, cli.rst] |
| 18 | Populate section removed from performance.rst | [18.0 performance.rst] |
| 19 | Sync collector still documented | [19.0 performance.rst] |
| 20 | Sync collector removed from docs; populate/blueprint command (`--blueprint`, `--seed`, `--scale`, `-j`, `--resume`, `--profile`) | [20.0 performance.rst, cli.rst] |

### How to check
Debug mode > Enable profiling, reproduce the slow action, open Settings > Technical > Profiling, open the record in speedscope.

### Question seeds
1. Scenario: A page is slow; you suspect many queries. Answer: use the SQL collector, count and group queries. Tempting wrong: use periodic only. Why it fails: periodic samples stacks and does not count queries.
2. Scenario: A customer on Online wants a flame graph. Answer: not possible on Online. Tempting wrong: enable profiling in debug mode. Why it fails: Online DBs cannot be profiled.
3. Scenario: Profile returns HTTP 500 on a long run. Answer: memory limit; raise `--limit-memory-hard` or shorten the run. Tempting wrong: bug in speedscope. Why it fails: docs list memory limits as a pitfall.
4. Scenario: A loop calls `search` per record. Answer: batch with one search or `_read_group`. Tempting wrong: add `index=True`. Why it fails: the cost is the number of queries.

---

## 9. Logging and security guidance

### What it is
Server log options and the security checklist the docs give for production.

### How it works
1. Default level INFO to stderr. Options: `--logfile`, `--syslog`, `--log-db <db>` (to `ir.logging`), `--log-handler LOGGER:LEVEL`, `--log-web`, `--log-sql`, `--log-level` (including `debug_sql`, `debug_rpc`, `debug_rpc_answer`); `--log-handler` wins on conflict [18.0 and 20.0 cli.rst].
2. Login attempts logged as "Login failed for db:... login:... from IP" and "Login successful ..."; a fail2ban filter example is given [deploy.rst "Blocking Brute Force Attacks"].
3. Security list: strong `admin_passwd`; no admin/admin or demo data on public servers; dbfilter plus `list_db=False`; PostgreSQL user not superuser and not DB owner; HTTPS with proxy mode; rate limit and fail2ban; outbound firewall; separate staging and production; daily offsite backups [deploy.rst "Security"; identical 17-20].
4. Code-level security: `SQL` wrapper against injection, `Domain` for domains, careful `sudo()` [20.0 security.rst].

### Where it breaks
- `debug_rpc_answer` in production logs data and slows the server.
- Default `admin_passwd` is `admin` in source.
- Brute-force blocking only works if the proxy passes the real IP (proxy mode).

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `--log-config` exists as a plain path option | [source 16.0 config.py] |
| 17 | No change found | [17.0 cli.rst] |
| 18 | No change found | [18.0 cli.rst] |
| 19 | RPC deprecation warning added to logs | [source 19.0 addons/rpc/controllers/__init__.py] |
| 20 | `--log-config` (JSON/TOML dictConfig, `keep_odoo_default`); `--syslog` deprecated | [20.0 cli.rst] |

### How to check
`odoo-bin --log-level=debug_sql` in a test run, or `grep "Login failed" odoo.log`.

### Question seeds
1. Scenario: Logs are flooded by the RPC deprecation warning. Answer: raise that logger to ERROR with `--log-handler`. Tempting wrong: fix by disabling RPC. Why it fails: the warning only signals legacy clients.
2. Scenario: Brute-force attempts all show 127.0.0.1. Answer: enable `--proxy-mode` with the proxy headers. Tempting wrong: fail2ban misconfig. Why it fails: the app sees only the proxy IP.
3. Scenario: You need logs in the database for a support view. Answer: `--log-db <db>` writes `ir.logging`. Tempting wrong: `--log-web`. Why it fails: `--log-web` logs HTTP requests at debug level, not DB storage.
4. Scenario: PostgreSQL user is a superuser to ease the manager. Answer: not allowed by the guidance; grant createdb only. Tempting wrong: required for `db dump`. Why it fails: the docs say the user must not be superuser.

---

## 10. Odoo Online vs Odoo.sh vs on-premise

### What it is
Three hosting models with different control over code, upgrades and infrastructure.

### How it works
| Aspect | Online | Odoo.sh | On-premise |
|---|---|---|---|
| Custom Python modules | no | yes | yes |
| Upgrade | rolling, automatic at deadline; user can trigger | commit triggers; auto-revert on failure | `-u` + upgrade platform |
| Backups | daily, Cloud SLA | prod 7/4/3; manual 3 days | yours |
| Profiling | no | Tools tab, 5 min | yes |
| Extended support | no | yes | yes |
| External API | Custom plan only | per docs | per docs |
Citations: [odoo_online.rst; upgrade.rst; branches.rst; standard_extended_support.rst; external_api.rst; all content/administration/ unless noted, identical 17-20].

Odoo.sh details:
1. Stages: production (one), staging (neutralized production duplicates), development (new DB with demo data and tests). Production loads no demo and runs no tests; a failed update rolls code and DB back; module version bump in the manifest triggers a production update [branches.rst, builds.rst].
2. Staging/dev mail goes to a catcher. Logs: `pip.log`, `install.log`, `odoosh-import-database.log`, `odoo.log`, `update.log`, `pg_slow_queries.log`, `sh_webshell.log`, `sh_editor.log`, `neutralize.log`; upgrade log `~/logs/upgrade.log` [branches.rst, builds.rst].
3. Scheduled actions run best effort and no more often than every 5 minutes; work in small batches, commit per batch, be idempotent [odoo_sh/advanced.rst].
4. Workers are bought via the account manager; more workers do not cure slow code [settings.rst].
5. Online web services: `POST https://www.odoo.com/json/2/odoo.database/list` and `/get_audit_logs` (one call per 5 minutes) [18.0, 20.0 odoo_online.rst].

### Where it breaks
- Planning a custom module on Online.
- Assuming staging reuses its DB: branches.rst and builds.rst disagree (see Doubts).
- Moving from an intermediate SaaS version straight to on-premise.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Administration docs differ slightly from 17 | [16.0 content/administration/*] |
| 17 | 17 loses Online support at end of standard window (extended only Odoo.sh/on-prem) | [17.0 standard_extended_support.rst] |
| 18 | No change found | [18.0 content/administration/*] |
| 19 | No change found | [19.0 content/administration/*] |
| 20 | No change found | [20.0 content/administration/*] |

### How to check
Online: Settings > About or the database manager list; Odoo.sh: project page, branch builds; on-premise: `odoo-bin --version` and the server config.

### Question seeds
1. Scenario: Customer wants a Python module with a nightly job. Answer: Odoo.sh or on-premise. Tempting wrong: Online with Studio automated actions replacing all code. Why it fails: question asks for custom code, which Online forbids.
2. Scenario: A production update on Odoo.sh fails halfway. Answer: code and DB roll back. Tempting wrong: DB remains half-updated. Why it fails: documented rollback.
3. Scenario: A cron on Odoo.sh must run every minute. Answer: not guaranteed; minimum 5 minutes, best effort. Tempting wrong: set interval 1 minute. Why it fails: Odoo.sh limits it.
4. Scenario: Dev branch built overnight and used for a demo the next week. Answer: dev DBs last about 3 days. Tempting wrong: they persist like production. Why it fails: dev DBs are short-lived.

---

## Gaps

- No JSON-2 documentation before 19.0; `/doc` dynamic documentation is "Under construction" in 20.0.
- No docs text on how `ir.rule` applies to XML-RPC specifically; only the JSON-2 statement and generic security page.
- Administration docs are identical 17-20, so no per-version docs changes exist for them.
- 16-18 docs state no deprecation dates for RPC endpoints.
- Upgrade platform's own standard-module scripts: not found.
- Version in which the bus websocket was introduced: not found.
- Online rolling schedule beyond the support table: not looked up.
- Odoo.sh upgrade report format: not verified.
- The log wording of migration script execution and the expected output of the how-to-check commands marked "not verified" were not run.

## Doubts

- `--limit-request`: docs say 8196; source 16-20 defaults to `2**16`.
- Replica port default: 18 docs say 5432, 19/20 docs say `--db_port`.
- 20.0 docs say the db service was removed in "Online 19.1 (winter 2025)"; the support table dates 19.1 January 2026. The 19.0 docs say all three services go in 22.
- 20.0 docs say keys last at most three months; source exempts system users and caps others by group `api_key_duration` (90 days on one group, else 1 day; in 20 the group is `group_user_regular`).
- 17.0 and 18.0 docs already list Odoo 20.0: the administration docs are rolling, not version-pinned.
- branches.rst says a staging push updates the previous build ("New build" gives a fresh copy); builds.rst says every staging push uses a fresh copy of production.
- The `ir.rule`-over-XML-RPC claim relies on generic security docs.
- The 20.0 external_api.rst XML-RPC snippet mixes `execute` and `search` in a muddled way.
- upgrade_scripts docs say `pre` runs "before the module is loaded"; source shows before schema update and data load.
- Section 6 capacity answer (about 9 workers for 4 CPUs) applies the rule of thumb; real sizing depends on RAM.
