# Odoo 16-20 backend and ORM map

Citation forms. `[20.0 content/developer/reference/backend/orm.rst]` is the documentation repo, branch 20.0. `[source 20.0 odoo/orm/models.py]` is the Odoo source on that branch. Anything marked "not found" was not located in either. Docs clones were taken on 2026-10-01/02 (16.0 on 2026-08-28).

## Summary (Odoo 19/20)

1. Computed fields default to `store=False`, `readonly = not inverse`, and `compute_sudo` follows `store` in source [source 20.0 odoo/orm/fields.py `_setup_attrs__`]. Related fields are sudo, readonly, not copied.
2. `compute_sql(table)` lets a non-stored computed field be grouped and ordered in SQL. The changelog lists it in Online 19.1 [20.0 content/developer/reference/backend/orm/changelog.rst]. 20.0 source has it; 19.0 and 18.0 source do not [source 20.0 odoo/orm/fields.py]. [corrected]
3. From 19.0 constraints are model attributes (`models.Constraint`, `models.Index`, `models.UniqueIndex`). `_sql_constraints` only logs a warning [source 19.0 odoo/orm/model_classes.py].
4. `@api.constrains` fires only for fields present in the create/write vals, accepts simple names only, and runs as sudo.
5. `onchange` lives in the `web` module, runs on a `new()` pseudo-record, and only for fields in the form view.
6. The ORM is cache-based: reads prefetch, writes defer to `flush_*`, and raw SQL needs `flush_*`, `invalidate_*` and `modified`. `SQL` and `execute_query` handle flushing from 17.1.
7. `search_fetch` (private) combines search and read. `_read_group` returns tuples with `field:agg` aggregates. `formatted_read_group` (in `web`) returns dicts and exists from 19.0.
8. Inheritance is `_inherit` (extend or copy) and `_inherits` (delegation to a parent record via a Many2one).
9. In 20.0 source access control is one model, `ir.access` (permission rows with a group, restriction rows without). 19.0 and earlier use `ir.model.access` plus `ir.rule`. The 20.0 docs still describe the old pair.
10. Public RPC methods are all methods not starting with `_` and not marked `@api.private`. Crons use the progress API (`_commit_progress`) in 19/20, and data files load in order with `noupdate` controlling reloads.

---

## 1. Fields and compute

### What it is
A computed field gets its value from a method named in `compute=`. `@api.depends` tells the ORM when to recompute and, for stored fields, when to write. `store`, `inverse`, `search`, `compute_sudo`, `precompute` and (20.0) `compute_sql` change how it behaves.

### How it works
1. Declare `total = fields.Float(compute='_compute_total', store=True)`; the method assigns `record.total` on every record of `self` [20.0 content/developer/reference/backend/orm.rst].
2. `@api.depends('line_ids.price')` lists dotted paths. A path that includes `id` raises NotImplementedError [source 20.0 odoo/orm/decorators.py].
3. `@api.depends_context('company')` adds context keys. Special keys: `company`, `uid`, `active_test` [source 20.0 odoo/orm/decorators.py].
4. Defaults for computed fields: `store=False`, `compute_sudo=store`, `readonly=not inverse`, `copy=False` unless stored and not readonly [source 20.0 odoo/orm/fields.py `_setup_attrs__`].
5. Related fields: `store=False`, `compute_sudo=True`, `copy=False`, `readonly=True` [source 20.0 odoo/orm/fields.py `_setup_attrs__`].
6. `inverse='_inverse_x'` runs in `write()`. Order in `write`: validate constraints of non-inversed fields, run inverses, validate constraints of inversed fields [source 20.0 odoo/orm/models.py `write`].
7. `search='_search_x'` takes `(operator, value)` and returns a domain or `NotImplemented`. The domain is first normalised (`=` becomes `in`) [source 20.0 odoo/orm/fields.py docstring].
8. `precompute=True` computes the value at `create` before the INSERT. A default or an explicit value in vals disables it [source 20.0 odoo/orm/fields.py docstring].
9. `recursive=True` must be declared explicitly. Recursive fields are computed record by record [source 20.0 odoo/orm/fields.py docstring].
10. `compute_sql` (19.1 Online changelog; in 20.0 source, not in 19.0 source): method `(table)` returning an `SQL` object. Used by `ir.access.kind` and `for_read` [source 20.0 odoo/addons/base/models/ir_access.py]. [corrected]

### Where it breaks
- A non-stored readonly computed field that fails to assign raises `ValueError("Compute method failed to assign ...")`. A stored one silently gets the null value [source 20.0 odoo/orm/fields.py `__get__`].
- Several fields sharing one inverse: while the inverse runs they are protected, and reading another protected field not in cache returns False. The docs warn against sharing [20.0 content/developer/reference/backend/orm.rst].
- `precompute` hurts when records are created one at a time.
- Missing a dependency leaves a stored value stale with no error.
- Related fields cannot chain through x2many [20.0 content/developer/reference/backend/orm.rst].
- `compute_sql` warns if there is no `compute` or if `compute_sudo` is not explicit [source 20.0 odoo/orm/fields.py].
- A field and a method with the same name silently overwrite each other [20.0 content/developer/reference/backend/orm.rst].

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Computed/related semantics as above. Translated fields are JSONB. | [16.0 content/developer/reference/backend/orm/changelog.rst] |
| 17 | 17.2: `group_operator` renamed `aggregator`; group/aggregate/order by related non-stored fields. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 18 | 18.3: domain optimisation runs before `Fields.search` methods; `=` is treated as `in`. [corrected] | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 19 | 19.2 Binary raw storage; 19.3 `BinaryValue`; 19.4 inverse write order by `write_sequence`. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 20 | `compute_sql` (changelog: 19.1 Online); `copy` can be a function (`mark_as_copy`); `BinaryValue.filename`. | [source 20.0 odoo/orm/fields.py], [20.0 content/developer/reference/backend/orm/changelog.rst] [corrected] |

### How to check
Shell: `env['res.partner']._fields['display_name']` then print `.compute, .store, .compute_sudo, .readonly, .copy`. UI: Settings > Technical > Fields, open the field (developer mode).

### Question seeds
1. Scenario: A stored `margin` depends on `line_ids.price_unit`, but the dev wrote `@api.depends('line_ids')`. Users edit a line price and the margin does not move. Correct: depend on `line_ids.price_unit`; depends tracks only the listed paths. Tempting wrong: "add `store=True` to the line field". Fails: storage of the dependency does not add it to the trigger graph.
2. Scenario: A computed `is_late` must be filterable in a list search. The dev leaves `store=False` and no `search`. Correct: add `search='_search_is_late'` returning a domain (or store it). Tempting wrong: "filters work automatically on any field with a compute". Fails: a non-stored field without `search` cannot be used in a domain and raises.
3. Scenario: Two computed fields share one `inverse` method and the inverse reads the second one. It returns False sometimes. Correct: protected fields are not in cache during inverse; use separate inverses or read the value from vals. Tempting wrong: "invalidate the cache inside the inverse". Fails: the fields are protected during the inverse, so a refetch is blocked.
4. Scenario: A dev needs to group by a non-stored computed field on 18.0 using `compute_sql`. It does nothing. Correct: `compute_sql` exists only in 20.0 source; on 18 store the field or use a related stored path. Tempting wrong: "it needs `group_operator`". Fails: the keyword is not in 18 source and `aggregator` is for aggregating, not for SQL expression of the field.

---

## 2. Constraints

### What it is
Python constraints (`@api.constrains`) validate after write/create in the ORM. Database constraints are `CHECK`, `UNIQUE` and indexes. From 19.0 they are declared as model attributes.

### How it works
1. `@api.constrains('start', 'end')` runs `_check_dates` after create/write if any named field is in vals. It raises `ValidationError` [source 20.0 odoo/orm/models.py `_validate_fields`].
2. Only simple field names work. Dotted names are ignored [source 20.0 odoo/orm/decorators.py]. [corrected]
3. The check runs as `self.sudo()` [source 20.0 odoo/orm/models.py `_validate_fields`].
4. 19/20 DB constraints: `_name_uniq = models.Constraint("UNIQUE (name)", "message")`; also `models.Index(...)`, `models.UniqueIndex(...)`. The attribute name must start with `_`; the DB name is `{table}_{name}` [source 20.0 odoo/orm/table_objects.py].
5. The message may be a string or a function `(env, diag)` [source 20.0 odoo/orm/table_objects.py].
6. 18 and earlier: `_sql_constraints = [(name, definition, message)]` [18.0 content/developer/reference/backend/orm.rst].
7. 19/20 log "Model attribute '_sql_constraints' is no longer supported, please define models.Constraint on the model." [source 20.0 odoo/orm/model_classes.py].

### Where it breaks
- A constraint on a field absent from the form/view vals never fires. An "is required" check needs a `create` override [source 20.0 odoo/orm/decorators.py]. [corrected]
- Dotted names are silently ignored.
- Migrating a module from 18 to 19 without converting `_sql_constraints` drops them with only a log warning.
- A `Constraint` name ending `_not_null` triggers a PG18 clash warning [source 20.0 odoo/orm/table_objects.py].
- Constraints running as sudo see all records, so uniqueness checks cross companies.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `_sql_constraints`, `@api.constrains`. | [16.0 content/developer/reference/backend/orm.rst] |
| 17 | no change found | [17.0 content/developer/reference/backend/orm.rst] |
| 18 | 18.1 changelog: constraints and indexes as model attributes (landing in 19.0 branch). | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 19 | `models.Constraint/Index/UniqueIndex`; `_sql_constraints` warns. | [source 19.0 odoo/orm/model_classes.py] |
| 20 | Same as 19; index with a different comment is dropped and recreated. | [source 20.0 odoo/orm/table_objects.py] |

### How to check
Shell: `env['res.partner']._table_objects` is not verified; instead check PostgreSQL: `psql db -c "\d res_partner"` and look at the constraint names. Python constraint: call `write` with a bad value and expect `ValidationError`.

### Question seeds
1. Scenario: A `@api.constrains('line_ids.qty')` check never raises when a line quantity is set to -1. Correct: dotted names are ignored; constrain on the line model. Tempting wrong: "add `store=True`". Fails: constrains triggers by the written model's own fields.
2. Scenario: A 19.0 module still has `_sql_constraints = [('uniq','unique(name)','dup')]`. Duplicates get through after the upgrade. Correct: it is unsupported and only logs; use `models.Constraint`. Tempting wrong: "the DB already had it so it still holds". Fails: constraints are applied from the model attributes on update, so none is created for new installs.
3. Scenario: A required-field check lives in `@api.constrains('partner_id')`, but records created via a wizard without that field still save. Correct: constrains triggers only when the field is in vals; override `create` or use a DB NOT NULL. Tempting wrong: "constrains always runs on every save". Fails: it is keyed on the fields in vals.
4. Scenario: A uniqueness constraint should be per company; the dev used a Python constrains with `search_count`. Two users in different companies conflict. Correct: constraints run as sudo, so add the company to the domain or use a composite `UniqueIndex`. Tempting wrong: "the search respects the user's rules". Fails: `_validate_fields` uses `self.sudo()`.

---

## 3. Onchange

### What it is
`onchange` is a web-client RPC that computes values for a form before saving. It runs on a pseudo-record created by `new()`. It is implemented in the `web` module.

### How it works
1. The client calls `onchange(values, field_names, field_specs)`. An empty `field_names` is the first call, which applies defaults [source 20.0 addons/web/models/models.py `onchange`].
2. Only fields in the form view spec are processed. Write or create access is required.
3. Methods decorated `@api.onchange('f')` run on the pseudo-record, then stored computed fields that depend on the change fire as well.
4. A method may return `{'warning': {'title':..., 'message':..., 'type': 'dialog'|'notification'}}` (dialog is the default) [source 20.0 odoo/orm/decorators.py]. [corrected]
5. Context key `recursive_onchanges` controls chained calls [source 20.0 addons/web/models/models.py].

### Where it breaks
- Dotted names are not supported [source 20.0 odoo/orm/decorators.py]. [corrected]
- An onchange cannot modify the one2many/many2many field itself (webclient limitation) [source 20.0 odoo/orm/decorators.py]. [corrected]
- CRUD calls on pseudo-records are undefined [source 20.0 odoo/orm/decorators.py].
- Onchange does not run on import, RPC `write` or `create`. Business rules there belong in compute or constrains.
- A field not in the view is invisible to the onchange.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `onchange` in base models. Not rechecked. | not found |
| 17 | `web_models.py` fetched (17.0 `addons/web/models/models.py`) but onchange location not compared. | not found |
| 18 | no change found | not found |
| 19 | in `web` module | [source 19.0 addons/web/models/models.py] |
| 20 | in `web` module, line ~2189 | [source 20.0 addons/web/models/models.py] |

### How to check
Developer mode, open a form, change the trigger field, watch the network call `web/dataset/call_kw/<model>/onchange` in the browser dev tools.

### Question seeds
1. Scenario: A field is changed in the form and the onchange method updates a computed field, but the field is missing in the view. Correct: fields not in the view spec are not onchanged. Tempting wrong: "onchange reads all model fields". Fails: it uses the form view spec.
2. Scenario: An import of CSV rows needs the same recomputation the form does. The dev relies on `@api.onchange`. Correct: onchange is form-only; use compute/create. Tempting wrong: "import triggers onchange". Fails: import calls `create`/`load`, not the onchange RPC.
3. Scenario: An onchange returns a list of lines for `line_ids` it sets itself. Correct: it cannot modify the one2many field via return; assign commands to the field on the record instead. Tempting wrong: "return `{'value': {...}}`". Fails: the value-return style is not supported for x2many by the webclient.
4. Scenario: A warning must not block the user. Correct: return a warning with type `notification`. Tempting wrong: `raise UserError`. Fails: it aborts the onchange.

---

## 4. Recordsets, env, prefetch

### What it is
A recordset is an ordered collection of records of one model, bound to an `Environment` (cursor, uid, context, su). Attribute access reads from a cache and prefetches siblings.

### How it works
1. `records.field` on a single record reads the cache. On a miss the ORM fetches the field for the prefetch set [20.0 content/developer/reference/backend/orm.rst].
2. Non-relational fields on a multi-record set raise an error; relational fields return a recordset.
3. Recordsets may hold duplicates [20.0 content/developer/reference/backend/orm.rst].
4. `sudo`, `with_context`, `with_user`, `with_company`, `with_prefetch` return a new recordset. `sudo`, `with_context` and `with_prefetch` share the prefetch object.
5. `with_company` puts the company first in `allowed_company_ids`; an unauthorized company can raise AccessError.
6. `with_context(key=...)` keeps `allowed_company_ids`. The context key `company` triggers a warning [source 20.0 odoo/orm/environments.py].

### Where it breaks
- `sudo()` keeps the user but mixes multi-company records [20.0 content/developer/reference/backend/orm.rst].
- Reading in a loop over many separate `browse(id)` loses the prefetch benefit.
- 19: `record._cr`, `_context`, `_uid` are deprecated. Use `env.cr`, `env.context`, `env.uid`.
- 19.3: x2many access returns only accessible records, fixing cache pollution [20.0 content/developer/reference/backend/orm/changelog.rst].

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | 15.3: `browse` rejects str; `filtered_domain` keeps order. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 17 | no change found | not found |
| 18 | 18.2: PEP 420 namespaces for `odoo`. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 19 | `_cr/_context/_uid` deprecated; 19.3 `concat`/`union` simplified; x2many cache fix. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 20 | 19.4 thread-safe ormcache. | [20.0 content/developer/reference/backend/orm/changelog.rst] |

### How to check
Shell: `partners = env['res.partner'].search([], limit=5); partners._prefetch_ids`. Count queries with `--log-level=debug_sql`.

### Question seeds
1. Scenario: A loop does `for id in ids: env['sale.order'].browse(id).partner_id.name`. It is slow. Correct: browse the ids once so the prefetch set covers all. Tempting wrong: "call `invalidate_all`". Fails: it empties the cache and adds queries.
2. Scenario: A dev runs `partners.name` on a 5-record set. Correct: error, as non-relational fields need a singleton. Tempting wrong: "returns a list of names". Fails: use `mapped('name')`.
3. Scenario: A job runs `.sudo()` to read invoices across companies and the totals mix currencies. Correct: sudo drops the user's company scoping; use `with_company` per company. Tempting wrong: "sudo is the same user so rules apply". Fails: rules are bypassed.
4. Scenario: Code uses `self._uid` on 19. Correct: deprecated; use `self.env.uid`. Tempting wrong: "removed so it crashes". Fails: it is deprecated, not removed.

---

## 5. Cache, flush, invalidate

### What it is
Writes are deferred in the environment and flushed to PostgreSQL later. The cache holds field values. Raw SQL must align with both.

### How it works
1. `env.flush_all()` and `Model.flush_model(fnames)` write pending values. `flush_recordset` is private.
2. `invalidate_all`, `invalidate_model`, `invalidate_recordset(fnames, flush=True)` drop cache values.
3. After a raw `UPDATE ... RETURNING id` call `invalidate_recordset` and then `modified` (private) so dependents recompute [source 20.0 odoo/orm/models.py `modified`, line ~6269].
4. Use `SQL` and `env.execute_query(SQL(...))`. It flushes based on SQL metadata [source 20.0 odoo/orm/environments.py].
5. `_flush_search` was deprecated in 17.1 and is absent from 19/20 source.

### Where it breaks
- Raw `cr.execute` of a SELECT without flushing the model returns stale rows.
- A raw UPDATE without invalidate leaves stale cache and stale stored computes.
- `invalidate_cache` exists in 16.0 source and not in 17.0.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `invalidate_cache` still in source. | [source 16.0 odoo/models.py] |
| 17 | `SQL` wrapper (17.0); flushing done by `execute_query` (17.1); `_flush_search` deprecated. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 18 | no change found | not found |
| 19 | `odoo.osv` deprecated; `_cr` etc. deprecated. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 20 | 19.4 thread-safe ormcache. | [20.0 content/developer/reference/backend/orm/changelog.rst] |

### How to check
Shell: `env.cr.execute("UPDATE res_partner SET name='x' WHERE id=1")`; then `env['res.partner'].browse(1).name` before and after `invalidate_recordset(['name'])`.

### Question seeds
1. Scenario: A script does `cr.execute("UPDATE ...")` then reads the record and sees the old value. Correct: the cache is stale; call `invalidate_recordset`. Tempting wrong: "commit first". Fails: commit does not touch the in-memory cache.
2. Scenario: A raw SELECT after `write` on the same record misses the change. Correct: `flush_model` first, or use `execute_query`. Tempting wrong: "write is immediate". Fails: writes are deferred.
3. Scenario: After a raw UPDATE of `price`, a stored `total` is stale. Correct: call `modified(['price'])` after invalidation. Tempting wrong: "invalidate recomputes dependents". Fails: it only drops cache.
4. Scenario: A 17 module calls `_flush_search`. Correct: removed in 19/20; flushing happens in search. Tempting wrong: "it still exists privately". Fails: absent in 19/20 source.

---

## 6. search, search_fetch, search_count

### What it is
`search` finds records by domain. `search_fetch` does the search and the read in few queries. `search_count` counts, with an optional `limit`.

### How it works
1. `search(domain, offset, limit, order)` calls `search_fetch(domain, [], ...)` [source 20.0 odoo/orm/models.py].
2. `search_fetch(domain, field_names, offset, limit, order)` is `@api.private`. It computes non-stored fields listed in `field_names` [source 20.0 odoo/orm/models.py line 1452].
3. `search_count(domain, limit=None)` stops counting at `limit` [source 20.0 odoo/orm/models.py line 1416].
4. `fetch(field_names)` is private.
5. 18.0: `name_get` removed. `display_name` is computed by `_compute_display_name`; name search uses `_search_display_name`.
6. Domains: `Domain` class with `&`, `|`, `~`, `Domain.AND/OR/TRUE/FALSE`; operators `any`, `not any`, `any!`, `child_of`, `parent_of`, `=?` [20.0 content/developer/reference/backend/orm.rst].

### Where it breaks
- Concatenating user domains as lists lets a user inject `'|'`. Use `Domain` [20.0 content/developer/reference/backend/security.rst]. [corrected]
- `any!` bypasses access checks.
- `search_count` without `limit` on a big table is a full count.
- `search_fetch` is private, so it is not callable via RPC.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `search_count` takes `limit`. No `search_fetch` in 16.0 source. | [20.0 content/developer/reference/backend/orm/changelog.rst], [source 16.0 odoo/models.py] |
| 17 | `search_fetch` present in 17.0 source (changelog: 16.2 Online); 17.4 `inselect` removed. | [source 17.0 odoo/models.py] |
| 18 | `name_get` removed; `_search_display_name`; 18.1 `odoo.Domain`. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 19 | 19.0 dynamic dates in domains. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 20 | `access` operator, e.g. `('move_id', 'access', 'read')` (19.3). | [20.0 content/developer/reference/backend/orm/changelog.rst] |

### How to check
Shell: `env['res.partner'].search_count([], limit=10)`; with `--log-level=debug_sql` count queries for `search_fetch([...], ['name'])`.

### Question seeds
1. Scenario: A badge shows "99+" for open tickets. The dev uses `len(search(domain))`. Correct: `search_count(domain, limit=100)`. Tempting wrong: `search_count` with no limit. Fails: it counts everything.
2. Scenario: A dev builds `domain = user_domain + [('company_id','=',cid)]` from an RPC arg. A user passes `['|', ('id','>',0)]`. Correct: use `Domain.AND`. Tempting wrong: "list concatenation is implicit AND". Fails: a leading `|` consumes the next two terms.
3. Scenario: A 18 module defines `name_get`. Correct: removed in 18; override `_compute_display_name`. Tempting wrong: "name_get is only deprecated". Fails: deprecated in 16.4, gone in 18.
4. Scenario: A dev calls `search_fetch` via JSON-RPC. Correct: it is `@api.private`, rejected. Tempting wrong: "no underscore means public". Fails: the decorator marks it private.

---

## 7. _read_group and formatted_read_group

### What it is
`_read_group` aggregates records in SQL and returns tuples. `formatted_read_group` (in `web`) returns dicts for the web client.

### How it works
1. `_read_group(domain, groupby, aggregates, having, offset, limit, order)` returns tuples. Many2one groupbys and the `recordset` aggregate come back as recordsets [source 20.0 odoo/orm/models.py line 1996].
2. Aggregates are `field:agg`, plus `__count`, `count_distinct`, `recordset`, and `array_agg_distinct` (19/20 only).
3. Date/datetime groupby needs a granularity: `create_date:month`. Granularities: day, week, month, quarter, year, plus `*_number` and `day_of_week` (17.3).
4. No granularity on a date field raises `ValueError("Granularity not set on a date(time) field")`; granularity on a non-date field raises ValueError.
5. No groupby and no aggregates raises ValueError. An empty result with no groupby still returns one row.
6. `formatted_read_group` is in [source 20.0 addons/web/models/models.py line 1022]. Returns dicts with `__extra_domain` and `__fold`. It handles `group_expand` (offset 0, limit not reached), the `fill_temporal` context (not with limit/offset) and `formatted_read_grouping_sets`.
7. `read_group` is deprecated since 19.0 in the source docstring.

### Where it breaks
- Forgetting the granularity on a date groupby.
- With a Many2many groupby, `_read_grouping_sets` swaps `__count` for `id:count_distinct` [source 20.0 odoo/orm/models.py line 1822]. [corrected]
- `formatted_read_group` is not in 17/18 `web`.
- Tuples from `_read_group` are positional (groupby then aggregates).

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | 16.0 source `_read_group(domain, fields, groupby, ...)` is the old signature. | [source 16.0 odoo/models.py] |
| 17 | New `_read_group` signature in 17.0 source; 17.2 `aggregator`; 17.3 more granularities. | [source 17.0 odoo/models.py], [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 18 | no `formatted_read_group` in 18.0 `web` source (the 18.2 changelog announces it). [corrected] | [source 18.0 addons/web/models/models.py] |
| 19 | `formatted_read_group`; `read_group` deprecated; `array_agg_distinct`. | [source 19.0 addons/web/models/models.py] |
| 20 | `read_group` is `@typing.final` in source with the new signature. | [source 20.0 odoo/orm/models.py line 1932] |

### How to check
Shell: `env['sale.order']._read_group([], ['partner_id', 'date_order:month'], ['amount_total:sum', '__count'])`.

### Question seeds
1. Scenario: A dev groups by `date_order` and gets a ValueError. Correct: add a granularity (`date_order:month`). Tempting wrong: "default is day". Fails: no default is applied.
2. Scenario: A report sums the per-tag order counts (many2many groupby) and the total is too high. Correct: an order is in one group per tag, so count `id:count_distinct` without the groupby for a total. Tempting wrong: add up the group counts. Fails: each record appears once per tag group. [corrected]
3. Scenario: A 18.0 module calls `formatted_read_group`. Correct: not present in 17/18 web. Tempting wrong: "it is a base ORM method". Fails: it lives in `web` and appears in 19.
4. Scenario: A dev wants group ids for each row. Correct: aggregate `id:recordset` (or `array_agg`). Tempting wrong: a second search per group. Fails: N+1 queries.

---

## 8. Inheritance

### What it is
Three mechanisms: classical (`_inherit` plus new `_name`), extension (`_inherit` without `_name`), delegation (`_inherits`).

### How it works
1. Extension: `_inherit = 'res.partner'` adds fields/methods to the same model and table.
2. Classical: `_name = 'x'`, `_inherit = 'res.partner'` copies into a new table.
3. Delegation: `_inherits = {'res.partner': 'partner_id'}`; the Many2one is declared `required=True, ondelete="cascade"`. Fields are read from and written to the parent record [20.0 content/developer/reference/backend/orm.rst].
4. With duplicate field names across parents, the last one wins.
5. Child ACL checks include the parent model's access (`_check_inherits_access`) [source 20.0 odoo/orm/models.py].
6. `ir.cron` uses `_inherits` of `ir.actions.server` in 19/20 [source 20.0 odoo/addons/base/models/ir_cron.py].

### Where it breaks
- A field and a method sharing a name overwrite each other silently.
- Delegated fields are not copied by `copy` unless handled.
- Parent access is required too, so a user may read the child yet fail on the parent.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | no change found | not found |
| 17 | no change found | not found |
| 18 | no change found | not found |
| 19 | `ir.cron` delegates to `ir.actions.server`. | [source 19.0 odoo/addons/base/models/ir_cron.py] |
| 20 | `_get_groups_with_access` intersects parent models. | [source 20.0 odoo/addons/base/models/ir_access.py] |

### How to check
Shell: `env['res.users']._inherits` shows `{'res.partner': 'partner_id'}`.

### Question seeds
1. Scenario: A `student` model delegates to `res.partner` and the dev stores `name` on student. Correct: `name` lives on the partner record. Tempting wrong: "delegation copies fields to the child table". Fails: that is classical inheritance.
2. Scenario: A model with `_inherit` and no `_name` should have its own table. Correct: it extends in place and adds no table. Tempting wrong: "it creates a copy". Fails: needs a new `_name`.
3. Scenario: A user can read `student` but gets AccessError. Correct: the parent model's access is also checked. Tempting wrong: "child ACL is sufficient". Fails: `_check_inherits_access`.
4. Scenario: A field `state` and a method `state` exist in one class. Correct: one silently replaces the other. Tempting wrong: "Odoo raises at load". Fails: no error is raised.

---

## 9. Access control

### What it is
Three layers: model access (ACL), record rules, and field `groups`. Odoo 16 to 19 use `ir.model.access` and `ir.rule`. The 20.0 source has a single `ir.access` model.

### How it works
1. ACL (16-19): `ir.model.access` rows per group with read/write/create/unlink flags, additive. An empty group means every user [20.0 content/developer/reference/backend/security.rst].
2. Record rules (16-19): `ir.rule` with `domain_force`; variables `time`, `user`, `company_id`, `company_ids`. Global rules intersect; group rules union; the two sets intersect. Perm flags mean "applies to this operation" [20.0 content/developer/reference/backend/security.rst].
3. 20.0 `ir.access`: fields `model_id`, `group_id`, `operation` (subset of "crud"), `domain`, computed `kind` (permission if a group is set, else restriction) [source 20.0 odoo/addons/base/models/ir_access.py].
4. `Model._access_domain(operation)` returns `Domain.OR(permissions) & Domain.AND(restrictions)`. No permission means the FALSE domain [source 20.0 odoo/orm/models.py ~3600].
5. `customize()` copies a standard access and deactivates the original [source 20.0 odoo/addons/base/models/ir_access.py].
6. Data file: `ir.access.csv` columns `id,name,model_id,group_id/id,operation,domain` [source 20.0 addons/sale/security/ir.access.csv]. 19.0 uses `ir.model.access.csv` plus `ir_rules.xml`.
7. `check_access(operation)` (`@api.private`) raises AccessError. `has_access` returns a bool. `_filtered_access` filters. On an empty recordset it checks model-level access [source 20.0 odoo/orm/models.py 3443-3506].
8. Field `groups='base.group_system'` removes the field from views and `fields_get`; read/write raise AccessError [20.0 content/developer/reference/backend/security.rst].
9. `check_field_access(field, 'read'|'write')`: `NO_ACCESS` groups are always forbidden [source 20.0 odoo/orm/models.py].
10. Groups: `res.groups` with `implied_ids`, `category_id`.

### Where it breaks
- Several global rules can remove all access.
- Rules are default-allow once the ACL grants; an unrelated group rule widens access for its members.
- `check_access_rights`/`check_access_rule` are deprecated since 18.0 in source.
- Superuser bypasses everything (`has_access` is always true).
- Record-level error detail appears only in debug mode for `base.group_no_one` users [source 20.0 odoo/addons/base/models/ir_access.py].
- A domain on the `ir.access` model itself is not allowed.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `ir.model.access` + `ir.rule`; `check_access_rights`/`check_access_rule`. | [16.0 content/developer/reference/backend/security.rst] |
| 17 | no change found | not found |
| 18 | `check_access`, `has_access`, `_filtered_access` combine ACL and rules. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 19 | Old pair in source and docs. | [source 19.0 odoo/addons/base/models/ir_rule.py] |
| 20 | `ir.access` merges ACLs and rules (19.4 changelog); no `ir_rule.py` in source. | [source 20.0 odoo/addons/base/models/ir_access.py] |

### How to check
UI: Settings > Technical > Security > Access Rights / Record Rules (19), or the `ir.access` menu (20). Shell: `env['res.partner'].with_user(uid).check_access('write')`.

### Question seeds
1. Scenario: Two groups each have a rule on `sale.order`; a user in both sees records of either. Correct: group rules union. Tempting wrong: "they intersect". Fails: only global rules intersect.
2. Scenario: A rule with `perm_read` unchecked is expected to forbid read. Correct: the flag means "applies to read"; unchecked means it does not apply. Tempting wrong: "it denies read". Fails: it is not a grant flag.
3. Scenario: A field with `groups` is requested by a user outside the group via RPC read. Correct: AccessError. Tempting wrong: "returns an empty value". Fails: read and write raise.
4. Scenario: A 20.0 module ships `ir.model.access.csv`. Correct: 20.0 source uses `ir.access.csv`; compatibility is not found. Tempting wrong: "identical across 16-20". Fails: the 20.0 base has no `ir.model.access` model in source.

---

## 10. api.private and sudo

### What it is
`@api.private` marks a public-looking method as not callable over RPC. `sudo()` runs with superuser rights while keeping the user.

### How it works
1. RPC resolves methods with `get_public_method`. Names starting with `_` are rejected, as are names in `_UNSAFE_ATTRIBUTES`. Any class in the MRO with `_api_private` blocks the method [source 20.0 odoo/orm/models.py ~199].
2. 20.0 also rejects classmethod and staticmethod ("cannot be called remotely").
3. Location of `get_public_method`: 18.0 and 19.0 `odoo/service/model.py`; 20.0 `odoo/orm/models.py`. [corrected]
4. `@api.readonly` allows a readonly cursor for RPC (18+). `search` and `search_count` are readonly.
5. `sudo()` bypasses ACLs and rules, keeps the user. `with_user` resets to non-su.
6. Untrusted: the record and arguments of any public method. ACLs are enforced only during CRUD [20.0 content/developer/reference/backend/security.rst].
7. Use `record[field]`, not `getattr`, on dynamic field names.
8. `_allow_sudo_commands = False` on `ir.access` and `ir.cron`.

### Where it breaks
- An override without the decorator of an `@api.private` base still stays private.
- A public method that does `self.sudo().write(vals)` with caller vals is a privilege escalation.
- `getattr(record, name)` with a user name reaches methods.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `_api_private` present in 16.0 `odoo/api.py`. | [source 16.0 odoo/api.py] |
| 17 | `_api_private` present in 17.0. | [source 17.0 odoo/api.py] |
| 18 | changelog 18.2: `@api.private` added; check in `odoo/service/model.py`. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 19 | check still in `odoo/service/model.py`. | [source 19.0 odoo/service/model.py] [corrected] |
| 20 | check moved to `odoo/orm/models.py`; classmethod/staticmethod rejected. | [source 20.0 odoo/orm/models.py] [corrected] |

### How to check
JSON-RPC: call `/web/dataset/call_kw` with `search_fetch`; expect rejection. Shell: `from odoo.api import ...` not needed; check `hasattr(Model.search_fetch, '_api_private')`.

### Question seeds
1. Scenario: A button method `action_approve(self)` writes under `sudo()` with no checks. Correct: any user who can call it escalates; check access first. Tempting wrong: "RPC checks ACL on method call". Fails: ACLs apply on CRUD only.
2. Scenario: A dev overrides a private base method without the decorator and calls it over RPC. Correct: stays blocked since a base class in the MRO is private. Tempting wrong: "override is public". Fails: MRO check.
3. Scenario: Code does `getattr(rec, field_name)` with field_name from the client. Correct: use `rec[field_name]`. Tempting wrong: "same thing". Fails: getattr resolves methods.
4. Scenario: A cron worker needs one user's rules. Correct: `with_user(user)` resets su. Tempting wrong: `sudo(user)`. Fails: `sudo` does not change the user.

---

## 11. Cron

### What it is
`ir.cron` records run a server action on a schedule through cron worker threads. From 18.3 and in 19/20 the progress API lets one job process batches with commits.

### How it works
1. Fields: `name`, `interval_number`, `interval_type`, `model_id`, `code`, `nextcall`, `priority`, `user_id`, `failure_count`, `first_failure_date` [20.0 content/developer/reference/backend/actions.rst].
2. `lastcall` goes in the context [source 20.0 odoo/addons/base/models/ir_cron.py].
3. `_process_job` runs the action repeatedly until done; status is `fully done`, `partially done` or `failed`. Partial reschedules ASAP [source 20.0 odoo/addons/base/models/ir_cron.py].
4. `self.env['ir.cron']._commit_progress(processed, remaining=None, deactivate=False)` commits and returns the seconds remaining; outside a cron it commits and returns inf. Do not self-reschedule [20.0 content/developer/reference/backend/actions.rst].
5. `_rollback_progress()` replaces `cr.rollback()` in the 20 docs.
6. `_trigger(at=None, coalesce=0)` schedules an extra run. `method_direct_trigger` runs in the HTTP thread with a new cursor; needs write access; raises UserError if running [source 20.0 odoo/addons/base/models/ir_cron.py].
7. Failure: 3 consecutive timeouts count as one failure; 5 failures spanning 7 days deactivate the job and notify the admin. Constants: `MAX_FAIL_TIME` 5h, `MIN_RUNS_PER_JOB` 10, `MIN_TIME_PER_JOB` 120s in 20.0 (10s in 19.0) [source 20.0 odoo/addons/base/models/ir_cron.py]. [corrected]
8. `@api.autovacuum` private methods run daily from `ir.autovacuum`.
9. CLI: `--max-cron-threads` (default 2), `--limit-time-worker-cron`; `--no-http` still starts cron.

### Where it breaks
- Calling `cr.commit()` yourself breaks the framework's progress tracking.
- A job that never calls `_commit_progress` is single-run and cannot be split.
- Cron runs as `user_id`, not as the admin.
- A trigger run inside the HTTP thread fails with UserError if a worker is running it.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `numbercall` and `doall`; docs title "Automated Actions". | [16.0 content/developer/reference/backend/actions.rst], [source 16.0 odoo/addons/base/models/ir_cron.py] |
| 17 | same fields. Docs title "Scheduled Actions" (not checked for 17). | [source 17.0 odoo/addons/base/models/ir_cron.py] |
| 18 | `failure_count`, `CONSECUTIVE_TIMEOUT_FOR_FAILURE=3`, `MIN_FAILURE_COUNT_BEFORE_DEACTIVATION=5`; docs and 18.0 source show `_notify_progress`, not `_commit_progress`. [corrected] | [source 18.0 odoo/addons/base/models/ir_cron.py] |
| 19 | `_commit_progress`, `MIN_RUNS_PER_JOB`, `_inherits` ir.actions.server. | [source 19.0 odoo/addons/base/models/ir_cron.py] |
| 20 | Docs add `_rollback_progress`; example uses `len(records) < limit`. | [20.0 content/developer/reference/backend/actions.rst] |

### How to check
UI: Settings > Technical > Scheduled Actions, run manually. Shell: `env['ir.cron'].search([]).mapped(lambda c: (c.name, c.nextcall, c.failure_count))`.

### Question seeds
1. Scenario: A cron handles 50k records and times out. Correct: process a batch, call `_commit_progress(done, remaining)`, return; the framework re-runs. Tempting wrong: "commit and `_trigger` itself". Fails: do not self-reschedule.
2. Scenario: A cron fails every night for a week. Correct: after 5 failures over 7 days it is deactivated and the admin notified. Tempting wrong: "it retries forever". Fails: deactivation rule.
3. Scenario: A cron's code sees records the admin sees but the cron user should not. Correct: it runs as `user_id`, check that field. Tempting wrong: "always superuser". Fails: `user_id`.
4. Scenario: A 18 module sets `numbercall=-1`. Correct: field exists in 16/17 source; not in the 18.0, 19.0 or 20.0 source. [corrected] Tempting wrong: "present everywhere". Fails: version dependence.

---

## 12. Module data loading

### What it is
Manifest `data` and `demo` files (XML, CSV) load in order at install and update. External ids (`ir.model.data`) track records, and `noupdate` controls reload.

### How it works
1. Files run sequentially. Operations refer only to earlier results [20.0 content/developer/reference/backend/data.rst].
2. `<odoo noupdate="1">` or `<data noupdate="1">`: records load at install only. Without it they reload on `-i` and `-u`.
3. Elements: `record` (model, id, context, forcecreate), `field` (ref, search, eval, type), `delete`, `function`, `menuitem`, `template`, `asset`.
4. `active` on `<template>`/`<asset>` is considered only at creation.
5. CSV: file name `{model}.csv`; first column `id` is the external id.
6. Source: `forcecreate` default True; with noupdate and forcecreate false, missing records are not recreated [source 20.0 odoo/tools/convert.py].
7. `@api.ondelete(at_uninstall=False)` for unlink checks that must not block uninstall.
8. `unlink` also removes `ir.model.data` rows and attachments.

### Where it breaks
- Editing a noupdate record in code and running `-u` changes nothing.
- A data file referencing a later file's xml id fails.
- Demo data is not loaded by default from 18.3.
- Ordering of manifest `data` entries matters (security before views).

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | no change found | not found |
| 17 | no change found | not found |
| 18 | 18.3 demo not loaded by default; 18.4 `reinit` CLI option. | [20.0 content/developer/reference/backend/orm/changelog.rst] |
| 19 | no change found | not found |
| 20 | `populate` script; manifest terms in module translation files; ACL data file is `ir.access.csv`. | [20.0 content/developer/reference/backend/orm/changelog.rst] |

### How to check
UI: Settings > Technical > External Identifiers, filter on the xml id and read the Non Updatable column. Query: `select noupdate from ir_model_data where module='base' and name='main_company';`.

### Question seeds
1. Scenario: A dev changes a mail template under `noupdate="1"` and runs `-u`. Nothing changes. Correct: noupdate records load only at install; edit the record or use a migration. Tempting wrong: "force with `-u all`". Fails: noupdate stays.
2. Scenario: A view XML references a group defined in a security file listed later. Correct: reorder; files load sequentially. Tempting wrong: "Odoo resolves all ids first". Fails: refs resolve against earlier results.
3. Scenario: A CSV for `res.partner.category` lacks an `id` column. Correct: no external id, so it duplicates on each update. Tempting wrong: "name is the key". Fails: id is the key.
4. Scenario: A test depends on demo data in 18.3+. Correct: demo is off by default. Tempting wrong: "demo always loads". Fails: changelog 18.3.

---

## 13. Tests and tours

### What it is
Python tests in a `tests` package run by the test runner. Tours drive the web client through `HttpCase`.

### How it works
1. Tests live in `tests/test_*.py`, imported in `tests/__init__.py`; methods start with `test_`. Classes: `TransactionCase`, `HttpCase`, `Form`, `M2MProxy`, `O2MProxy` [20.0 content/developer/reference/backend/testing.rst].
2. Tags: default `standard`; `at_install` or `post_install`. `@tagged` is a class decorator. A plain `unittest.TestCase` is untagged and not run by default.
3. `--test-tags` syntax `[-][tag][/module][:class][.method]`; it implies `--test-enable`. Tests run only in installed modules.
4. `assertQueryCount` checks query counts.
5. Tours: `tour.register`, loaded via `web.assets_tests`; run from Python with `HttpCase.start_tour(url, name, login=...)`.
6. Debug: `watch=True`, `debug=True`, `break: true`, `pause: true`. Screenshots in `/tmp/odoo_tests/{db}/screenshots/`.
7. Onboarding tours use a `web_tour.tour` record. The last tour step must leave a stable state.
8. JS unit tests use Hoot [20.0 content/developer/reference/backend/testing.rst].

### Where it breaks
- A test module not imported in `tests/__init__.py` is silently skipped.
- `TransactionCase` rolls back; `HttpCase` browser calls run in a separate transaction view and need committed data semantics handled by the framework.
- `post_install` is the default in source; an `at_install` need must be explicit. The docs say both `at_install` (line 105) and `post_install` (line 222) [source 20.0 odoo/tests/common.py]. [corrected]
- A tour whose last step leaves a modal fails the next tour.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | testing.rst differs by 704 lines from 20 (not inspected). | not found |
| 17 | differs by 635 lines (not inspected). | not found |
| 18 | 18 and 19 differ by 46 lines (not inspected). | not found |
| 19 | see 18 | not found |
| 20 | Hoot for JS; screenshots path. | [20.0 content/developer/reference/backend/testing.rst] |

### How to check
Command: `odoo-bin -d db -i my_module --test-tags /my_module --stop-after-init`.

### Question seeds
1. Scenario: A new `test_x.py` never runs. Correct: import it in `tests/__init__.py`. Tempting wrong: "discovery by filename". Fails: modules are imported explicitly.
2. Scenario: A test needs to run only after all modules install. Correct: `@tagged('post_install', '-at_install')`. Tempting wrong: "default is at_install". Fails: source tags tests `standard` and `post_install` by default [source 20.0 odoo/tests/common.py]. [corrected]
3. Scenario: A dev runs `--test-tags :TestFoo.test_bar` without `--test-enable`. Correct: `--test-tags` implies it. Tempting wrong: "needs both". Fails: implied.
4. Scenario: A tour must run as a specific user. Correct: `start_tour(url, name, login='demo')`. Tempting wrong: "set `self.env.user`". Fails: the browser session is separate.

---

## Gaps
- No docs for `compute_sql`; the Field docstring links to a docs section that does not describe it.
- `security.rst` in 20.0 does not document `ir.access`.
- No docs for `formatted_read_group` or `@api.readonly`.
- Whether 20.0 keeps compatibility aliases for `ir.model.access` and `ir.rule`: not found.
- `ir.model.data` internals (`xmlid_to_res_id`, the noupdate field): `ir_model_data.py` was not found at the fetched path in any version.
- `testing.rst` and `security.rst` diffs between 16/17/18 and 20 were counted, not read.
- Onchange location in 16/17/18 not compared.
- 17/18 docs titles for cron not checked. 18 cron docs not compared to source in detail.
- By-version rows marked "not found" mean the diff was not examined, not that nothing changed.
- Source facts are from shallow clones; line numbers are 20.0 and may drift.

## Doubts
1. Changelog 18.2 says `@api.private` was added, but `_api_private` is in 16.0 and 17.0 `odoo/api.py`.
2. Changelog says new `_read_group` signature in Online 16.3, but 16.0 source has the old signature and 17.0 has the new.
3. 20.0 docs `security.rst` describes `ir.model.access` and `ir.rule`; 20.0 source has only `ir.access`.
4. Docs say `compute_sudo=True` by default in the store bullet; source ties it to `store`.
5. `read_group` is "deprecated since 19.0" yet is `@typing.final` with the new signature in 20.0 source; docs silent.
6. The cron docs example uses `len(records) == limit` in 19 and `< limit` in 20.
7. 18.0 docs show `_notify_progress` while the 18.3 changelog says a new cron API arrived; the 18.0 branch source was not matched to either.
8. `search_fetch` changelog says 16.2 Online but 16.0 source has none.
9. none open. `numbercall` is absent from 18.0 source (checked). [corrected]
