#!/usr/bin/env python3
"""
discover_wayback_2324.py — Uses Wayback Machine CDX API to find all
futbolaspalmas.com group URLs archived in May 2024 (end of 2023-2024 season).
Saves URL list to scripts/wayback_2324_urls.json
"""
import json, time, urllib.request, urllib.parse

CDX_URL = "https://web.archive.org/cdx/search/cdx"
SITE    = "futbolaspalmas.com"
# Look for pages archived in late season 2023-2024 (April-June 2024)
FROM_DATE = "20240401"
TO_DATE   = "20240630"

KEYWORDS = ["benjamin", "prebenjamin"]

def cdx_query(url_pattern, from_date, to_date, limit=500):
    params = {
        "url": url_pattern,
        "output": "json",
        "filter": "statuscode:200",
        "from": from_date,
        "to": to_date,
        "fl": "timestamp,original",
        "collapse": "urlkey",
        "limit": str(limit),
    }
    full_url = CDX_URL + "?" + urllib.parse.urlencode(params)
    print(f"CDX query: {full_url}")
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    # First row is header
    if data and data[0] == ["timestamp", "original"]:
        data = data[1:]
    return data

def main():
    print("Querying Wayback Machine CDX API...")

    # Get all futbolaspalmas.com URLs archived in 2024
    results = cdx_query(f"{SITE}/*", FROM_DATE, TO_DATE, limit=1000)
    print(f"Total archived URLs: {len(results)}")
    time.sleep(1)

    # Filter for Benjamin/Prebenjamin groups
    group_urls = []
    for ts, url in results:
        url_lower = url.lower()
        if any(k in url_lower for k in KEYWORDS):
            # Only include group pages (not subpages)
            path = url.replace("https://futbolaspalmas.com/", "").replace("http://futbolaspalmas.com/", "")
            path = path.strip("/")
            if path and "/" not in path:  # single path segment = group page
                group_urls.append({"timestamp": ts, "url": url, "path": path})

    print(f"\nBenjamin/Prebenjamin group URLs: {len(group_urls)}")
    for g in group_urls:
        print(f"  [{g['timestamp']}] {g['url']}")

    # Also get ALL URLs to see what other groups exist
    all_group_urls = []
    for ts, url in results:
        path = url.replace("https://futbolaspalmas.com/", "").replace("http://futbolaspalmas.com/", "")
        path = path.strip("/")
        if path and "/" not in path and not path.startswith("?") and not path.startswith("#"):
            all_group_urls.append({"timestamp": ts, "url": url, "path": path})

    out = {
        "from": FROM_DATE,
        "to": TO_DATE,
        "total_archived": len(results),
        "benjamin_prebenjamin": group_urls,
        "all_groups": all_group_urls,
    }

    with open("scripts/wayback_2324_urls.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(all_group_urls)} group URLs to scripts/wayback_2324_urls.json")

if __name__ == "__main__":
    main()
