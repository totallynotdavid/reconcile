import { ch, map } from "./build";
import type { Track } from "./types";

export const notes: Track = {
  id: "notes",
  title: "Field notes",
  summary: "Scenarios from the docs map. Each wrong answer is one a consultant would defend.",
  levels: [
    {
      id: "notes-accounting",
      title: "Accounting decisions",
      brief: "Payment state, residual currency, exchange differences, locks.",
      caveat: "In payment needs the Enterprise accountant module. Community reports paid. The 20 docs still describe 19.",
      cards: [
        ch("n-acc-1", "notes-accounting", "A customer paid 600 on a 1,000 invoice. The consultant expects one account.full.reconcile. What exists?", "One account.partial.reconcile for 600. A full reconcile appears only when the lines net to zero", ["A full reconcile with a 400 write-off", "A full reconcile with a 400 open credit", "Nothing until the bank statement is matched"], "No write-off is created without a reconcile model or a manual action.", map("accounting", "19.0")),
        ch("n-acc-2", "notes-accounting", "A USD bill on a EUR company shows amount_residual 500 and amount_residual_signed -460. A user calls it a contradiction. Is it?", "No. One is the invoice currency, positive. The other is the company currency, signed", ["Yes. One of the two is stale", "Yes. Recompute the move", "No. Both are in EUR and differ by rounding"], "Never sum amount_residual across currencies. Sum amount_residual_signed.", map("accounting", "19.0")),
        ch("n-acc-3", "notes-accounting", "A line-level report reads amount_residual on a USD invoice line. In which currency is it?", "The company currency. Use amount_residual_currency for USD", ["USD, like the move field", "The partner currency", "The journal currency"], "Move and line fields share a name but not a currency.", map("accounting", "19.0")),
        ch("n-acc-4", "notes-accounting", "An invoice is cleared only by a full credit note. No cash moved. What is payment_state?", "reversed", ["paid, because the residual is zero", "in_payment", "partial"], "No payment line is matched and the counterparts are refunds.", map("accounting", "19.0")),
        ch("n-acc-5", "notes-accounting", "A community client records a bank payment and expects In Payment until the statement arrives. The invoice shows Paid. Why?", "in_payment needs the Enterprise accountant module. Community returns paid", ["The outstanding account is missing on the journal", "The statement was imported too early", "The payment is not posted"], "The outstanding account changes the entry. It does not change the state hook.", map("accounting", "19.0", false)),
        ch("n-acc-6", "notes-accounting", "A USD invoice is paid at a new rate. The bank shows 1,020 EUR against an invoice booked at 1,000 EUR. What happens?", "An exchange difference entry books 20 to the exchange income account", ["The invoice stays partial", "The 20 goes to the suspense account", "The payment is rejected"], "The USD amount is settled. Only the EUR value differs. The company needs an exchange journal configured.", map("accounting", "19.0")),
        ch("n-acc-7", "notes-accounting", "A bookkeeper must post one late bill in a closed month on 19. What is the narrowest fix?", "A lock exception for that user and period", ["Lower the global lock date", "Reset the lock to zero", "Post it on the first open day and edit the date later"], "Lowering the global date opens the period for everyone.", map("accounting", "19.0")),
        ch("n-acc-8", "notes-accounting", "A migration script filters payment.state == 'posted'. It returns nothing on 18. Why?", "18 gave account.payment its own state values (in_process, paid, and others). Update the filters", ["Payments are no longer posted", "The model was renamed", "Payments moved to account.bank.statement"], "Posting still exists through action_post. The values changed. Source for 20 renames them again.", map("accounting", "18.0", false)),
      ],
    },
    {
      id: "notes-backend",
      title: "ORM traps",
      brief: "Dependencies, constraints, cache, domains.",
      caveat: "Several answers rest on source reading, not docs. The map marks them.",
      cards: [
        ch("n-orm-1", "notes-backend", "A stored margin uses @api.depends('line_ids'). Users edit a line price and the margin does not move. Fix?", "Depend on 'line_ids.price_unit'. The trigger graph holds only the listed paths", ["Add store=True to the line field", "Call invalidate_all in write", "Add @api.onchange"], "Storage of the dependency does not add it to the trigger graph.", map("backend", "16.0 to 20.0")),
        ch("n-orm-2", "notes-backend", "@api.constrains('line_ids.qty') never raises when a line gets -1. Why?", "Constraints trigger on the written model's own fields. Dotted names are ignored", ["The constraint needs store=True", "Constraints run only on create", "Constraints do not see negative numbers"], "Put the constraint on the line model.", map("backend", "17.0 to 19.0")),
        ch("n-orm-3", "notes-backend", "A 19 module still has _sql_constraints = [('uniq','unique(name)','dup')]. What is the risk?", "It is no longer the supported form, so the constraint may not be created. Use the model Constraint attribute", ["None, the database already holds it", "It raises at import", "It becomes a Python constraint"], "18.1 moved constraints and indexes to model attributes.", map("backend", "18.1 to 19.0", false)),
        ch("n-orm-4", "notes-backend", "A uniqueness check uses search_count in a constrains method. Users of two companies conflict. Why?", "Constraint checks run as sudo, so the search sees every company", ["search_count ignores companies", "The method needs with_company", "The check runs before the write"], "Add the company to the domain, or use a composite unique index.", map("backend", "17.0", false)),
        ch("n-orm-5", "notes-backend", "A script runs cr.execute('UPDATE ...') then reads the record and sees the old value. What do you call?", "invalidate_recordset. The in-memory cache is stale", ["commit()", "flush_model", "refresh()"], "A commit does not touch the cache. After a raw UPDATE of a dependency, also call modified().", map("backend", "17.0 to 19.0")),
        ch("n-orm-6", "notes-backend", "A raw SELECT right after write misses the change. Why?", "Writes are deferred. Flush the model before the SELECT", ["The write needs a commit", "The ORM caches reads", "The cursor is read-only"], "flush_model sends pending writes to the database.", map("backend", "17.0 to 19.0")),
        ch("n-orm-7", "notes-backend", "A badge shows '99+' open tickets. What is the cheapest count?", "search_count(domain, limit=100)", ["len(search(domain))", "search_count(domain) with no limit", "read_group on id"], "The limit stops the count early.", map("backend", "16.0 to 20.0")),
        ch("n-orm-8", "notes-backend", "Code builds user_domain + [('company_id','=',cid)] and the user domain comes from RPC. What breaks?", "A leading '|' in the user domain consumes the next two terms, so the company filter can be skipped. Combine with Domain.AND", ["Nothing. Lists concatenate as AND", "The domain is rejected", "Only the order of terms changes"], "Prefix operators apply to the next terms, not to the list as a whole.", map("backend", "17.0 to 19.0", false)),
      ],
    },
    {
      id: "notes-client",
      title: "Views and client",
      brief: "Inheritance order, modifiers, validation at load.",
      caveat: "The docs do not describe attrs removal, view validation or tree to list. The answers here come from source.",
      cards: [
        ch("n-cli-1", "notes-client", "A 16 form with attrs=\"{'invisible':[('x','=',1)]}\" moves to 17. What happens at install?", "Validation raises. Use invisible=\"x == 1\"", ["It installs with a warning", "Odoo converts it on load", "It installs and ignores the attribute"], "Check the arch before you upgrade, not after.", map("frontend", "17.0", false)),
        ch("n-cli-2", "notes-client", "invisible=\"partner_id == False\" is used, but partner_id is not in the view. What happens?", "A load error. Every field an expression reads must be present in the view", ["The browser reads it from the record", "The expression is always false", "Odoo adds the field"], "Only view fields are in the evaluation context.", map("frontend", "19.0")),
        ch("n-cli-3", "notes-client", "invisible=\"state == 'done'\" is put on a list field to hide the column. Result?", "It hides cells per row. Use column_invisible for the column", ["The column disappears", "A load error", "The first row decides"], "invisible is evaluated per record. column_invisible is not.", map("frontend", "19.0")),
        ch("n-cli-4", "notes-client", "Two extensions both replace //field[@name='name'], priorities 10 and 20. Which applies first?", "Priority 10. Then 20 applies to the result", ["Priority 20", "The newest record", "Both apply to the original"], "Order is ascending priority, then id. The second xpath may no longer match.", map("frontend", "19.0", false)),
        ch("n-cli-5", "notes-client", "An 18 core list is extended with //tree/field[@name='x']. Result?", "No match. The arch tag is list", ["It still matches", "Odoo rewrites the xpath", "It matches on the form only"], "18 has no tree compatibility layer.", map("frontend", "18.0", false)),
        ch("n-cli-6", "notes-client", "In 19 you extend invisible=\"a\" with <attribute name=\"invisible\" add=\"b\"/>. What do you also need?", "separator=\"or\". Python attributes need and or or", ["Nothing, it ORs by default", "A comma separator", "A second xpath"], "The default separator suits class lists, not expressions.", map("frontend", "19.0", false)),
        ch("n-cli-7", "notes-client", "A kanban arch has a wrong attribute. Does the RNG check catch it?", "No. Kanban and form have no RNG schema", ["Yes, at install", "Yes, only in debug mode", "Only for 17+"], "Test the view by opening it, or run a tour.", map("frontend", "19.0", false)),
        ch("n-cli-8", "notes-client", "A template shows user HTML with t-out. What reaches the page?", "Escaped text, unless the value is Markup", ["Raw HTML", "Nothing", "Sanitized HTML"], "t-out escapes by default.", map("frontend", "19.0")),
      ],
    },
    {
      id: "notes-platform",
      title: "Upgrade and platform",
      brief: "Script phases, API removal, keys, workers, dumps.",
      caveat: "Docs state no removal date for 16 to 18. Online has no custom code.",
      cards: [
        ch("n-plat-1", "notes-platform", "You rename a column. Which script phase keeps the ORM from creating a new empty column?", "pre. It runs before the schema update", ["post", "end", "Any phase works"], "By post the ORM has already added the new column.", map("platform", "17.0 to 20.0")),
        ch("n-plat-2", "notes-platform", "A cleanup needs records from a module that loads after yours. Which phase?", "end", ["post in your module", "pre in your module", "Any module's init hook"], "post runs after your module and its dependencies only.", map("platform", "17.0 to 20.0")),
        ch("n-plat-3", "notes-platform", "A module is installed on an empty database. Does its migrations folder run?", "No. Scripts run only for modules being upgraded", ["Yes, pre scripts always run", "Yes, once", "Only end scripts"], "Install uses data files and init hooks.", map("platform", "17.0 to 20.0")),
        ch("n-plat-4", "notes-platform", "Two JSON-2 calls create an order and then confirm it. The second fails. What state is the order in?", "Created. Each call is its own transaction", ["Rolled back", "Locked", "Draft and hidden"], "Do the work in one method call, or compensate.", map("platform", "19.0")),
        ch("n-plat-5", "notes-platform", "On 20, an integration drops databases through xmlrpc/2/db. What happens?", "It fails. The db service is gone. Only common and object remain until 22", ["It works until 22", "It works but is logged", "It needs the master password only"], "The exam's JSON-RPC answer is out of date on this point.", map("platform", "20.0")),
        ch("n-plat-6", "notes-platform", "A bot reads invoices with an admin's API key. Does the key limit it to reading?", "No. The key carries the full rights of its user. Use a dedicated low-rights user", ["Yes, keys are read-only", "Yes, if the key has a scope", "No, but record rules block writes"], "Record rules still apply to that user. They do not apply to a replica.", map("platform", "19.0")),
        ch("n-plat-7", "notes-platform", "Live chat works in dev but not behind nginx. What is wrong?", "/websocket/ is not routed to the gevent port 8072", ["proxy_read_timeout is too low", "Workers are set to 0", "dbfilter is empty"], "A higher timeout does not help when the request never reaches that worker.", map("platform", "17.0 to 20.0")),
        ch("n-plat-8", "notes-platform", "A dump taken with --format dump is restored. What is missing?", "The filestore. Only a zip includes it", ["Nothing", "The attachments table", "The sequences"], "A SQL-only dump leaves attachments pointing at files that are not there.", map("platform", "17.0 to 20.0")),
      ],
    },
  ],
};
