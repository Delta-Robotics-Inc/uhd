
Concepts to ensure are in this:
- Exclusivity between components in the same ecosystem "proprietary connections"


## Vendor purchase-link reliability (cross-filed from ProtoPart, 2026-08-25)

Product URLs stored in part/purchase metadata rot fast, and they are the first thing a user clicks:
- Mouser detail URLs 404 without their `?qs=` token, and manufacturer slugs rename (Knowles vs CDE-Illinois-Capacitor).
- DigiKey page-id URLs are stable but page ids get mistaken for orderable part numbers.

If/when OpenUHD stores supplier links: (1) prefer API-returned canonical ProductUrls over scraped/hand-built ones; (2) also store a search-fallback URL per row (e.g. digikey.com/en/products/result?keywords=MPN, mouser.com/c/?q=MPN) that never rots; (3) any price-refresh job should HTTP-validate stored links and flag dead ones instead of serving an error page as the first impression.
