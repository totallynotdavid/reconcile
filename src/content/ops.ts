import { bug, ch, doc, exam, step, triage, unverified } from "./build";
import type { Track } from "./types";

export const ops: Track = {
  id: "ops",
  title: "Operations",
  summary: "Upgrades, incidents, integrations. The calls a senior consultant gets asked to make.",
  levels: [
    {
      id: "ops-1",
      title: "Upgrade scripts",
      brief: "Place the script in the right phase and the right folder.",
      caveat: "The official upgrade service migrates core. Scripts here are for your own modules.",
      cards: [
        ch("p1-c1", "upgrade-scripts", "Where does an upgrade script for module awesome_partner live?", "awesome_partner/migrations/<version>/ (or upgrades/, allowed since 13), in a file starting with pre-, post- or end-", ["awesome_partner/scripts/upgrade.py", "awesome_partner/data/migrate.xml", "At the repository root in upgrades.sql"], "The path encodes the module, its full version and the phase. The file defines migrate(cr, version).", doc("20.0", "upgrade")),
        ch("p1-c2", "upgrade-scripts", "You must rename a column before the new model code loads. Which phase?", "pre, which runs before the module is loaded", ["post", "end", "Any phase works"], "Renaming under a loaded model that already expects the new name fails. Pre runs first.", doc("20.0", "upgrade")),
        ch("p1-c3", "upgrade-scripts", "You must backfill and recompute data that depends on other modules being updated. Which phase?", "post or end. End runs after every module has loaded and updated for that version", ["pre", "Before the first module", "None, it needs a cron"], "Post runs after the module and its dependencies are updated. End runs once all modules are done.", doc("20.0", "upgrade")),
        ch("p1-c4", "upgrade-scripts", "A module is installed at 17.0.1.0 and updated to 19.0.1.0. A script sits in migrations/17.0.1.0/. Does it run?", "No. The folder version must be higher than the installed version", ["Yes, it runs once", "Yes, it runs on every update", "Only if it is named pre-"], "The folder version must be greater than the installed one and less than or equal to the updated one.", doc("20.0", "upgrade")),
        bug("p1-b1", "idempotent", "The migration is retried after a failure. Which line makes the second run crash?", "python", [
          "def migrate(cr, version):",
          "    cr.execute(\"UPDATE account_move SET ref = name WHERE ref IS NULL\")",
          "    cr.execute(\"ALTER TABLE account_move RENAME COLUMN old_ref TO legacy_ref\")",
          "    cr.execute(\"UPDATE account_move SET legacy_ref = '' WHERE legacy_ref IS NULL\")",
        ], 2, "The rename fails once old_ref is gone. Check the column first. Exam answer: scripts must be idempotent because the process is trial and error.", exam("19.0")),
        ch("p1-c5", "upgrade-scripts", "Two pre scripts: pre-20-fix.py and pre-10-move.py. Which runs first?", "pre-10-move.py. Order within a phase is lexical", ["pre-20-fix.py", "Both run at once", "The one modified last"], "Prefix with numbers when order matters.", doc("20.0", "upgrade")),
      ],
    },
    {
      id: "ops-2",
      title: "Migration strategy",
      brief: "Prove nothing moved that should not have.",
      caveat: "The accountant signs the numbers. The queries only let you ask the right question.",
      cards: [
        ch("p2-c1", "migration-strategy", "Who migrates what when a customer moves from 17 to 19?", "The official service migrates core. You migrate your own modules by hand, one by one", ["The service migrates everything", "You migrate core and the service migrates custom modules", "Nothing is migrated; data is reimported"], "A version-only migration needs scripts, not an ETL, because data is already in Odoo's format.", exam("19.0")),
        ch("p2-c2", "migration-strategy", "How do you first work on the migration?", "On a snapshot of the database and filestore restored into dev, then staging, never first in production", ["In production at night", "On a fresh database with exported CSV", "Directly on a replica"], "Rehearse on copies and repeat until timing and errors are known.", exam("19.0")),
        ch("p2-c3", "integrity", "Which pair of checks proves the accounting survived?", "Balance per account and amount_residual per invoice, compared before and after, plus all entries balancing", ["Row counts of account_move", "Only the total of all debits against credits", "A visual check of five invoices"], "Totals recompute. Residuals encode reconciliation, and a wrong one shows invoices as collected when they are not.", exam("19.0")),
        ch("p2-c4", "integrity", "How do you detect duplicated entries after migration?", "Group by journal and name and look for counts above one. It must return nothing", ["Compare create_date", "Count rows per month", "Check the sequence table"], "account.move.name is unique per journal in a period.", exam("19.0")),
        ch("p2-c5", "migration-strategy", "When do you run the production migration?", "In an agreed window outside hours, after a period close, with invoicing frozen and the customer's accountant reachable", ["Friday afternoon, to give time over the weekend", "During a month-end close", "Whenever the dev team is ready"], "Starting from a reconciled balance makes the comparison trustworthy.", exam("19.0")),
        ch("p2-c6", "migration-strategy", "After the upgrade, which validation is the most revealing?", "A real user running the full circuit: create, post, partial payment, reconcile, credit note", ["A clean log only", "Counting installed modules", "Running the CSS build"], "Plus: clean log, identical integrity queries, every custom module tested, and role-by-role permissions.", exam("19.0")),
      ],
    },
    {
      id: "ops-3",
      title: "Incident triage",
      brief: "Choose the next check, in order, under pressure.",
      caveat: "Real incidents loop back. The cards show one clean path.",
      cards: [
        triage("p3-t1", "incident", "A customer cannot invoice. Production is down. You have just been paged.", [
          step("No one from the customer has heard from you.", "Tell them you are on it and when you will update next", ["Wait until you have a root cause", "Ask them to try again in an hour", "Open a ticket with no message"], "Communication comes first, with a time for the next update."),
          step("The customer is waiting for a reply.", "Check the basics: services up, disk, memory, connection pool, logs", ["Rewrite the invoice code", "Restart without reading logs", "Restore last week's backup"], "Rule out the cheap, common causes first."),
          step("Basics look fine.", "Find out whether it affects one user or all, and since when", ["Assume it is everyone", "Check the user's browser only", "Blame the last deploy"], "Scope and start time point at a change or an event."),
          step("All users, starting a few minutes ago. Logs are quiet.", "Look for orphaned locks or a stuck transaction in pg_stat_activity and pg_locks", ["Reindex every table", "Increase the worker count", "Clear the browser cache"], "One orphan lock can queue every transaction behind it."),
          step("A deploy went out right before it began.", "Roll back to the previous commit now, investigate afterwards on a snapshot", ["Hotfix live", "Wait for the developer who wrote it", "Disable the module in production blindly"], "Restore service first. Experiments go on a snapshot."),
        ], "Order matters: communicate, rule out basics, scope, locks, then revert while you investigate.", exam()),
        triage("p3-t2", "rpc-debug", "A user clicks a button and sees a generic error. The client shows RPC_ERROR.", [
          step("Where is the full error?", "In the Network tab: the failing call's response holds the traceback and error.data", ["In the browser console only", "In the user's email", "In the module manifest"], "The exception class and message sit in error.data."),
          step("You have the timestamp.", "Match it against the server log by time", ["Search the log for the word error", "Reboot and see if it recurs", "Ask the user for a screenshot"], "The server log has the context the client does not."),
          step("The traceback points at a lookup on a record.", "Reproduce as the same user who reported it", ["Reproduce as admin", "Reproduce on a different database", "Skip reproduction"], "Errors can cascade, and admin bypasses the rules that cause some of them."),
        ], "Network response, server log by timestamp, then reproduce as the reporting user.", exam()),
        ch("p3-c1", "rpc-debug", "Which tool helps find the asset line behind a JS error?", "?debug=assets", ["The ORM cache", "The module manifest", "ir.cron"], "It serves unminified assets, so a stack trace points at real lines. Developer mode also gives you view and field inspection.", exam()),
        ch("p3-c2", "rpc-debug", "You use the Odoo shell to test a fix on production data. What is the rule?", "Do not commit. Run against a snapshot where possible", ["Commit at the end of the session", "Use sudo and write to speed things up", "Disable the ORM cache"], "The shell runs against real data. A stray commit is a real change.", exam()),
      ],
    },
    {
      id: "ops-4",
      title: "Integration and extraction",
      brief: "Pick a door by who needs to see which rows.",
      caveat: "The replica answer is only right if everyone may see the same data.",
      cards: [
        ch("p4-c1", "integration", "Power BI must read accounting data for everyone in finance, who all see the same numbers. What do you connect?", "A read-only Postgres replica, through reporting views, so the primary carries no dashboard load", ["JSON-RPC with the admin account", "The primary database directly", "A CSV export every morning, by hand"], "A report needs nothing from the ORM. Exam answer.", exam()),
        ch("p4-c2", "integration", "Different people may see different companies or rows in the report. What changes?", "Authorization lives in Odoo, so go through the API with per-user rules", ["Add more views on the replica", "Grant the replica role more tables", "Nothing"], "A replica has no ir.rule. A Postgres role grants tables and columns, not rows.", exam()),
        ch("p4-c3", "integration", "For a new integration on Odoo 19 or later, which endpoint do you choose?", "/json/2 with an API key on a dedicated read-only user", ["/xmlrpc/2/object", "/jsonrpc", "Scraping /web with a session"], "RPC is deprecated and the common and object services are scheduled for removal in 22. The ir.rule of that user still applies.", doc("19.0", "extApi")),
        ch("p4-c4", "integration", "What is wrong with giving the BI role access to the base tables of the replica?", "res_users.password and the database secret live in the same database, and the role cannot filter rows", ["Nothing, it is read-only", "It is slower", "Odoo forbids it"], "Expose reporting views with the company filter inside, reachable only from the gateway.", exam()),
        ch("p4-c5", "extraction", "Which table is the best fact table for accounting extraction?", "account.move.line: one row per debit or credit with amount, date and the keys of account, partner and journal", ["account.move", "account.payment", "res.partner"], "Lines carry the amounts at the grain a report needs.", exam()),
        ch("p4-c6", "extraction", "Incremental load: which column and how?", "write_date, storing the highest value per run, a few minutes of overlap, deduplicating by id", ["create_date, exactly once", "id only", "A full reload every night"], "write_date catches edits. create_date would miss them. Overlap and dedupe cover transaction timing.", exam()),
        ch("p4-c7", "extraction", "Reconciling changes the residual. Why can an incremental extract on the invoice's write_date go stale?", "The residual can change without the invoice's write_date moving, so aging is recomputed from the fact table", ["write_date is not indexed", "Reconciliation deletes the row", "Postgres rewrites ids"], "Do not patch row by row. Rebuild the aging from the lines. Exam answer.", exam()),
        ch("p4-c8", "extraction", "Power BI decides by itself what is overdue. What is the risk?", "It matches today and diverges at the first rule change. Ship amount_residual and payment_state as they are", ["None, it is faster", "It breaks the replica", "It changes the invoice"], "Two definitions of overdue destroy trust in both reports.", exam()),
        ch("p4-c9", "extraction", "Over RPC you only need totals per partner. How do you keep it cheap?", "Ask for explicit fields, filter state = 'posted' at the source, and aggregate in the server with a grouped read", ["search_read all fields then sum in BI", "Read each invoice one by one", "Export the whole table"], "Since 18.2 the formatted public aggregate API is formatted_read_group, with read_group deprecated.", doc("18.2 (Online)", "ormLog")),
      ],
    },
    {
      id: "ops-5",
      title: "Consulting judgment",
      brief: "A customer pushback. Pick the first move.",
      caveat: "There is no single answer. The cards reward the move that learns before it acts.",
      cards: [
        ch("p5-c1", "consulting", "The customer wants to keep using Excel instead of Odoo. What do you do first?", "Find out what problem Excel solves today that Odoo does not solve well", ["Tell them Odoo is better", "Lock the Excel exports", "Offer a discount"], "Fix the friction. Do not argue with the habit.", exam()),
        ch("p5-c2", "consulting", "They say they do not trust the numbers in Odoo. What do you do?", "Compare Odoo with their Excel until you find the difference. It is usually a criterion, such as draft vs posted or prices with and without tax", ["Re-enter their data", "Ask them to trust the audit log", "Change the report"], "The gap is normally a definition, not a bug.", exam()),
        ch("p5-c3", "consulting", "They need to load many rows at once. What do you show?", "Inline editing, or export, edit and reimport", ["Write an import wizard", "Open the database to them", "Tell them to enter rows one by one"], "Use the tools already in the product before building.", exam()),
        ch("p5-c4", "consulting", "Where can Excel stay?", "As an analysis tool on data exported from Odoo, but never as the system of record", ["As the system of record, synced nightly", "Nowhere", "As the primary for invoices"], "Two sources of truth is the real risk.", exam()),
        ch("p5-c5", "consulting", "The team resists the new system. What helps?", "Training on that user's real workflow, if needed", ["A mandatory exam", "A new role in Odoo", "A longer manual"], "Adaptation problems are solved by showing the real task, not the generic tour.", exam()),
      ],
    },
  ],
};
