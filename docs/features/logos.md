# Feature: Bill logos and the calendar

**Status:** Approved
**Issue:** #

## Problem
A list of bill names is slow to scan. v1 showed each company's logo beside its bills, found automatically, and a
calendar where each day showed its bills with their logos and status. People want both back.

## In scope
- A logo on each bill, shown wherever the bill is: the bills table, the agenda, Home, the calendar, the payment sheet
  and the bill's history
- Finding logos automatically from two sources:
  1. **Logo.dev**, when an admin adds a Logo.dev key in Administration. It searches by the bill's name.
  2. **The bill's own website**, using the icon the site publishes, when the bill has a website.
- Choosing between the logos found, uploading your own, or removing it
- A lettered tile for a bill without a logo, the same size, so names line up
- **The Calendar page:** each day lists its bills with logo, name and status, with "+N more" and a list for the day
- **A small month calendar on Home:** a mark on each day with bills, showing the most urgent status, and choosing a
  day opens it on the Calendar page

## Out of scope
- Other logo services, such as Google's favicon service or Clearbit. Each one is another company told which bills
  you have
- Logos for payment accounts, which come with accounts in milestone 5
- Colors taken from logos
- SVG logos, which can carry scripts

## Behavior
**Finding logos**
- Given no Logo.dev key and a bill without a website, then no lookup happens and the bill gets a lettered tile.
- Given a Logo.dev key, when someone asks for logos for a name, then the server searches Logo.dev for that name and
  offers up to 6 matches, each with its company and website.
- Given a bill with a website, then the site's own icon is offered too, first if there's no Logo.dev key.
- Given a lookup, then it runs on the server. The browser only ever loads logos from Remidy.
- Given a lookup that fails or times out, then the bill is saved anyway, with a lettered tile.
- Given a new bill in the wizard, then the first match is chosen for it, and can be changed. Editing a bill never
  replaces a logo someone chose.

**Fetching from websites safely**
- Given a website to fetch from, then only `http` and `https` on their usual ports are allowed.
- Given a name that resolves to a private, loopback, link-local or other internal address, then it's refused, and
  the connection uses the address that was checked, so it can't be swapped in between.
- Given a redirect, then each step is checked the same way, and at most 3 are followed.
- Given a response, then it stops after 5 seconds or 512 KB.
- Given a file, then it's kept only if its first bytes show PNG, JPEG, GIF, WebP or ICO. The type the site claims is
  ignored.

**Storing and showing**
- Given a logo, then it's stored once, by its contents, and served from Remidy with the type found from its bytes.
- Given an upload, then the same type and size checks apply, with a limit of 256 KB.
- Given a logo that no bill uses for a day, then a daily job deletes it.
- Given someone signed in, then they can load a logo by its ID. IDs are random, so they can't be listed or guessed.
- Given a change of logo, then it's in the activity log like any change to the bill. Past due dates aren't changed.

**The Logo.dev key**
- Given an instance admin, then they can add, replace or remove the key in Administration. It's stored encrypted, and
  never shown again or sent to the browser, only whether one is set.
- Given anyone else, then they can't see or change it.

**Calendar**
- Given a day with bills, then each shows its logo, name and status: paid, skipped, overdue, due soon or upcoming,
  in words or an icon as well as color.
- Given more bills than fit, then "+N more" shows, and choosing the day lists them all.
- Given a phone, then days with bills are listed, each with their logos.
- Given Home's small calendar, then a day's mark shows its most urgent status, today stands out, and choosing a day
  opens the Calendar page with that day's list.

## Data
- New table `logo`: `id uuid`, `sha256 text UNIQUE`, `content_type text`, `bytes bytea`, `created_at`. Not in any
  space, because a company's logo isn't private and storing it once saves space.
- `bill.logo_id`, referencing `logo` with `ON DELETE SET NULL`.
- New table `instance_setting`: `key text PRIMARY KEY`, `value text`, `updated_at`, `updated_by`. The Logo.dev key is
  stored encrypted, with its key name as the encryption context.
- No existing data changes.

## API
- `GET /api/v1/logos/:logoId`, signed in: the image, cached by the browser for a year since a logo never changes.
- `POST /api/v1/logos/suggest` with a name and an optional website, signed in, rate limited: the logos found.
- `POST /api/v1/logos`, signed in, with an uploaded image: the stored logo's ID.
- `logoId` on the bill routes, checked to exist.
- `GET`, `PUT`, `DELETE /api/v1/admin/settings/logo-dev`, for instance admins: whether a key is set, and setting or
  removing it.

## Screens
- **The bill wizard**, Details step: the logo beside the name, with Change. Change opens the logos found, Upload, and
  Remove. Finding shows a spinner, and nothing found shows the lettered tile and Upload.
- **Bills, the agenda, Home and the payment sheet:** the logo before each name.
- **Calendar:** as under Behavior.
- **Home:** the small month calendar in the side panel, under This month.
- **Administration, Logos:** the Logo.dev key field, whether one is set, and a note that bill names are sent to
  Logo.dev while it's set.

## Depends on
Bills, payments, the encryption helper, the activity log, jobs, and Administration.

## Lessons from v1
- v1 used Logo.dev, then UpLead, then Google's favicon service. v2 keeps Logo.dev, swaps the other two for the
  bill's own website, and tells no other company which bills someone has.
- v1 stored each logo as a base64 data URL on the bill, so every bill list carried every image. v2 stores each logo
  once and the browser caches it.
- v1 accepted whatever type the logo service claimed. v2 checks the bytes.
- Logo.dev's free plan asks commercial projects to link back to it. A self-hosted instance for a household is
  personal use, and the Administration note says so.

## Done when
- [ ] Every rule under Behavior has a test, including each address the fetcher must refuse
- [ ] Wrong-role requests to the admin setting are rejected, with tests
- [ ] One end-to-end test covers choosing a logo and seeing it on the calendar, at desktop and phone sizes
- [ ] Sample data includes logos, drawn for the fictional companies, never real ones
- [ ] Docs updated
