def main():
    # Check if report_data.json exists in GitHub repo
    import urllib.request
    api_url = f"https://api.github.com/repos/weaversvilla/weavers-stock/contents/public/report_data.json"
    req = urllib.request.Request(api_url, headers={
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            print(f"File exists! Size: {data.get('size')} bytes")
            print(f"SHA: {data.get('sha')}")
    except Exception as e:
        print(f"File NOT found: {e}")
    return